import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import type { Instance } from '../../../shared-types'
import type { MediaFeature } from '../../MediaFeature'
import path from 'node:path'
import { flags } from '../../../shared-types'
import { db, schema } from '@napgram/infra-kit'
import { env } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'
import { renderContent } from '../utils/render'
import { AudioConverter } from './AudioConverter'
import { FileNormalizer } from './FileNormalizer'
import { MediaSender } from './MediaSender'
import { RichHeaderBuilder } from './RichHeaderBuilder'

const ALLOWED_TELEGRAM_DICE = new Set(['🎲', '🎯', '🏀', '⚽️', '🎳', '🎰'])

export class TelegramSender {
  private readonly logger = getLogger('ForwardFeature')
  private readonly audioConverter: AudioConverter
  private readonly fileNormalizer: FileNormalizer
  private readonly richHeaderBuilder: RichHeaderBuilder
  private readonly mediaSender: MediaSender

  constructor(
    private readonly instance: Instance,
    private readonly media?: MediaFeature,
    private readonly contentRenderer: (content: MessageContent) => string = renderContent,
  ) {
    this.audioConverter = new AudioConverter()
    this.fileNormalizer = new FileNormalizer(media)
    this.richHeaderBuilder = new RichHeaderBuilder()
    this.mediaSender = new MediaSender(this.fileNormalizer, this.richHeaderBuilder)
  }

  async sendToTelegram(chat: any, msg: UnifiedMessage, pair: any, replyToMsgId: number | undefined, nicknameMode: string) {
    this.logger.debug(`Forwarding message to TG (sendToTelegram):\n${JSON.stringify(msg, null, 2)}`)
    const showQQToTGNickname = nicknameMode[0] === '1'
    let header = showQQToTGNickname ? `${msg.sender.name} (${msg.sender.id}):\n` : ''
    // 保存原始header供媒体消息使用（媒体需要caption，即使启用了富头）
    const originalHeader = header
    let textParts: string[] = []

    let richHeaderUsed = false

    const disableFlag = pair ? ((pair.flags | this.instance.flags) & flags.DISABLE_RICH_HEADER) : 0
    const useRichHeader = pair && env.WEB_ENDPOINT && !disableFlag && showQQToTGNickname

    let richHeaderUrl: string | undefined
    if (useRichHeader) {
      richHeaderUrl = this.richHeaderBuilder.generateRichHeaderUrl(pair.apiKey, msg.sender.id, showQQToTGNickname ? (msg.sender.name || '') : ' ')
      richHeaderUsed = true
      // Rich Header已包含用户信息，文本消息不再重复显示 Header
      // 但保留 originalHeader 给媒体消息使用
      header = ''
    }

    const effectiveReplyTo = replyToMsgId || pair?.tgThreadId
    const replyTo = this.richHeaderBuilder.buildReplyTo(pair, effectiveReplyTo)
    const messageThreadId = pair?.tgThreadId ? Number(pair.tgThreadId) : undefined
    if (messageThreadId) {
      this.logger.info(`[Forward][QQ->TG] Sending to thread: ${messageThreadId}`)
    }
    else {
      this.logger.info('[Forward][QQ->TG] Sending to General (no thread ID)')
    }

    let lastSent: any = null
    // Media batching for Media Group支持
    const mediaBatch: MessageContent[] = []
    const batchCaption: string[] = []

    const flushMediaBatch = async () => {
      if (mediaBatch.length > 0) {
        const captionStr = batchCaption.join('')
        lastSent = await this.mediaSender.sendMediaGroup(
          chat,
          mediaBatch,
          captionStr,
          replyToMsgId,
          pair,
          originalHeader, // Use original header for media
          richHeaderUsed,
          richHeaderUrl,
          msg.id,
          this.sendMediaToTG.bind(this), // Pass sendMediaToTG as callback
        ) || lastSent

        mediaBatch.length = 0
        batchCaption.length = 0
        richHeaderUsed = false // Consumed by media
        header = ''
      }
    }

    for (const content of msg.content) {
      switch (content.type) {
        case 'reply':
          if (!replyToMsgId) {
            textParts.push(this.contentRenderer(content))
          }
          break

        case 'text':
        case 'at':
        case 'face':
          if (content.type === 'text' && content.data.text) {
            const text = content.data.text.trim()
            if (text === '[图片]' || text === '[视频]' || text === '[语音]') {
              break
            }
          }

          // If we're collecting media, add text to batch caption
          if (mediaBatch.length > 0) {
            batchCaption.push(this.contentRenderer(content))
          }
          else {
            textParts.push(this.contentRenderer(content))
          }
          break

        case 'image':
        case 'video':
          // Send any pending text first
          if (textParts.length > 0) {
            const { text, params } = this.richHeaderBuilder.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined)
            params.replyTo = replyTo
            if (messageThreadId)
              params.messageThreadId = messageThreadId

            await chat.sendMessage(text, params)
            textParts = []
            richHeaderUsed = false
            header = ''
          }

          // Add to media batch
          mediaBatch.push(content)
          break

        case 'audio':
        case 'file':
          // These can't be in Media Group, flush batch first
          await flushMediaBatch()

          if (textParts.length > 0) {
            const { text, params } = this.richHeaderBuilder.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined)
            params.replyTo = replyTo
            if (messageThreadId)
              params.messageThreadId = messageThreadId

            await chat.sendMessage(text, params)
            textParts = []
            richHeaderUsed = false
            header = ''
          }

          // Rich Header logic for non-groupable media
          if (richHeaderUsed) {
            let actionText = ''
            switch (content.type) {
              case 'audio':
                actionText = '发来一条语音'
                break
              case 'file':
                actionText = '发来一个文件'
                break
              default:
                actionText = '发来一条消息'
                break
            }
            const headerText = actionText

            const { text, params } = this.richHeaderBuilder.applyRichHeader(headerText, richHeaderUrl)
            params.replyTo = replyTo
            if (messageThreadId)
              params.messageThreadId = messageThreadId

            try {
              await chat.sendMessage(text, params)
            }
            catch (e) {
              this.logger.warn(e, 'Failed to send separate Rich Header message:')
            }
            richHeaderUsed = false
          }

          lastSent = await this.sendMediaToTG(chat, header, content, replyToMsgId, pair, richHeaderUsed, richHeaderUrl, msg.id) || lastSent
          richHeaderUsed = false
          header = ''
          break

        case 'forward':
          await flushMediaBatch()

          if (textParts.length > 0) {
            const { text, params } = this.richHeaderBuilder.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined)
            params.replyTo = replyTo
            if (messageThreadId)
              params.messageThreadId = messageThreadId

            await chat.sendMessage(text, params)
            textParts = []
            richHeaderUsed = false
            header = ''
          }
          lastSent = await this.sendForwardToTG(chat, content, pair, replyToMsgId, header, richHeaderUsed) || lastSent
          break

        case 'location':
          await flushMediaBatch()

          if (textParts.length > 0) {
            const { text, params } = this.richHeaderBuilder.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined)
            params.replyTo = replyTo
            if (messageThreadId)
              params.messageThreadId = messageThreadId

            await chat.sendMessage(text, params)
            textParts = []
            richHeaderUsed = false
            header = ''
          }

          lastSent = await this.mediaSender.sendLocationToTG(chat, content, replyTo, messageThreadId, header, richHeaderUsed, richHeaderUrl) || lastSent
          richHeaderUsed = false
          header = ''
          break

        case 'dice':
          await flushMediaBatch()

          if (textParts.length > 0) {
            const { text, params } = this.richHeaderBuilder.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined)
            params.replyTo = replyTo
            if (messageThreadId)
              params.messageThreadId = messageThreadId

            await chat.sendMessage(text, params)
            textParts = []
            richHeaderUsed = false
            header = ''
          }

          lastSent = await this.mediaSender.sendDiceToTG(chat, content, replyTo, messageThreadId, header, richHeaderUsed, richHeaderUrl, pair) || lastSent
          richHeaderUsed = false
          header = ''
          break

        default:
          textParts.push(this.contentRenderer(content))
          break
      }
    }

    // Flush any remaining media batch
    await flushMediaBatch()

    if (textParts.length > 0) {
      const { text, params } = this.richHeaderBuilder.applyRichHeader(header + textParts.join(' '), richHeaderUsed ? richHeaderUrl : undefined)
      if (replyTo)
        params.replyTo = replyTo
      if (messageThreadId)
        params.messageThreadId = messageThreadId

      lastSent = await chat.sendMessage(text, params)
      return lastSent
    }
    return lastSent
  }

  private async sendMediaToTG(chat: any, header: string, content: MessageContent, replyToMsgId?: number, pair?: any, richHeaderUsed?: boolean, richHeaderUrl?: string, qqMsgId?: string) {
    let fileSrc: any

    try {
      fileSrc = await this.fileNormalizer.resolveMediaInput(content, this.instance.tgBot.downloadMedia.bind(this.instance.tgBot))
    }
    catch (err) {
      this.logger.warn(err, 'Failed to process media, fallback to placeholder:')
      fileSrc = (content as any).data?.file || (content as any).data?.url
    }

    if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
      this.logger.debug(`Using local file path for mtcute: ${fileSrc}`)
      const fileName = path.basename(fileSrc);
      (content as any).data.fileName = fileName
    }

    const commonParams: any = {
      replyTo: this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId),
    }
    if (pair?.tgThreadId) {
      commonParams.messageThreadId = Number(pair.tgThreadId)
    }

    // 准备 caption - 将 header（昵称/头像）作为媒体说明
    let captionText: any
    let formattingParams: any = {}

    if (header) {
      const { text, params } = this.richHeaderBuilder.applyRichHeader(header, richHeaderUsed ? richHeaderUrl : undefined)
      // mtcute InputText check: if string and empty, or TextWith Entities and text empty
      const isEmpty = typeof text === 'string' ? !text.trim() : !text.text.trim()
      if (!isEmpty) {
        captionText = text
        formattingParams = params
        this.logger.debug(`Using header as media caption: ${typeof text === 'string' ? text : text.text}`)
      }
      else {
        this.logger.debug('Header is empty, skipping caption')
      }
    }

    try {
      let mediaInput: any

      if (content.type === 'image') {
        const fileName = (content as any).data.fileName || (typeof (content as any).data.file === 'string' ? path.basename((content as any).data.file) : 'image.jpg')
        const normalized = await this.fileNormalizer.normalizeInputFile(fileSrc, fileName || 'image.jpg')
        if (!normalized)
          throw new Error('Image source not available')
        const asGif = this.fileNormalizer.isGifMedia(normalized)
        mediaInput = {
          type: asGif ? 'animation' : 'photo',
          file: normalized.data,
          fileName: normalized.fileName,
        }
      }
      else if (content.type === 'video') {
        const fileName = (content as any).data.fileName || (typeof (content as any).data.file === 'string' ? path.basename((content as any).data.file) : 'video.mp4')
        const normalized = await this.fileNormalizer.normalizeInputFile(fileSrc, fileName || 'video.mp4')
        if (!normalized)
          throw new Error('Video source not available')
        mediaInput = {
          type: 'video',
          file: normalized.data,
          fileName: normalized.fileName,
        }
      }
      else if (content.type === 'audio') {
        const fileName = (content as any).data.fileName
          || (typeof (content as any).data.file === 'string' ? path.basename((content as any).data.file).replace(/\.amr$/, '.ogg') : 'audio.ogg')
        const normalized = await this.fileNormalizer.normalizeInputFile(fileSrc, fileName || 'audio.ogg')
        if (!normalized)
          throw new Error('Audio source not available')
        mediaInput = await this.audioConverter.prepareVoiceMedia(normalized)
      }
      else if (content.type === 'file') {
        const filename = (content as any).data.filename
        const normalized = await this.fileNormalizer.normalizeInputFile(fileSrc, filename || 'file')
        if (!normalized) {
          this.logger.warn(`File source not available, sending placeholder. src=${fileSrc}`)
          try {
            await chat.sendMessage(`[文件不可用] ${filename || ''}`.trim(), commonParams)
          }
          catch (e) {
            this.logger.warn(e, 'Failed to send file placeholder:')
          }
          return null
        }
        mediaInput = {
          type: 'document',
          file: normalized.data,
          fileName: normalized.fileName,
        }
      }
      else if (content.type === 'location') {
        const loc = (content as any).data
        const isVenue = Boolean((loc.title && loc.title.trim()) || (loc.address && loc.address.trim()))
        mediaInput = isVenue
          ? {
            type: 'venue',
            latitude: loc.latitude,
            longitude: loc.longitude,
            title: loc.title || '位置',
            address: loc.address || '',
            source: { provider: 'qq', id: '', type: '' },
          }
          : {
            type: 'geo',
            latitude: loc.latitude,
            longitude: loc.longitude,
          }
      }
      else if (content.type === 'dice') {
        const emoji = (content as any).data.emoji || '🎲'
        const value = (content as any).data.value
        if (!ALLOWED_TELEGRAM_DICE.has(emoji)) {
          // 不支持的 emoji，退回文本
          const { text, params } = this.richHeaderBuilder.applyRichHeader(`${header}${emoji}${value ? ` ${value}` : ''}`, richHeaderUsed ? richHeaderUrl : undefined)
          params.replyTo = this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId)
          if (pair?.tgThreadId)
            params.messageThreadId = Number(pair.tgThreadId)
          try {
            return await chat.sendMessage(text, params)
          }
          catch (e) {
            this.logger.error(e, 'Failed to send fallback text for dice:')
            throw e
          }
        }
        mediaInput = {
          type: 'dice',
          emoji,
        }
      }

      if (mediaInput) {
        const ttlSeconds = env.TG_MEDIA_TTL_SECONDS && env.TG_MEDIA_TTL_SECONDS > 0 ? env.TG_MEDIA_TTL_SECONDS : undefined
        const ttlAllowedTypes = new Set(['photo', 'video', 'voice', 'animation'])
        if (ttlSeconds && typeof (mediaInput as any).type === 'string' && ttlAllowedTypes.has((mediaInput as any).type)) {
          (mediaInput as any).ttlSeconds = ttlSeconds
        }

        const params: any = {
          ...commonParams,
          ...formattingParams,
          caption: captionText, // 使用 caption 传递 header
        }
        if (!params.replyTo)
          delete params.replyTo
        if (!params.messageThreadId)
          delete params.messageThreadId

        // mtcute handles string (path) and Buffer automatically
        let sentMsg: any
        try {
          sentMsg = await chat.client.sendMedia(chat.id, mediaInput, params)
        }
        catch (e) {
          if ((mediaInput as any)?.ttlSeconds) {
            this.logger.warn(e, 'sendMedia failed with ttlSeconds, retrying without ttlSeconds')
            delete (mediaInput as any).ttlSeconds
            sentMsg = await chat.client.sendMedia(chat.id, mediaInput, params)
          }
          else {
            throw e
          }
        }
        this.logger.debug(`[Forward] QQ message ${qqMsgId || ''} -> TG ${chat.id} (id: ${sentMsg.id})${captionText ? ' with caption' : ''}`)
        return sentMsg // Return the sent message
      }
    }
    catch (e) {
      this.logger.error(e, 'Failed to send media to TG:')
    }
    return null
  }

  private async sendForwardToTG(chat: any, content: MessageContent, pair: any, replyToMsgId?: number, header: string = '', richHeaderUsed?: boolean) {
    if (content.type !== 'forward' || !content.data.id) {
      return await chat.sendMessage(this.contentRenderer(content).replace(/\\n/g, '\n'), {
        replyTo: this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
      })
    }

    try {
      const entryArr = await db.insert(schema.forwardMultiple).values({
        resId: String(content.data.id),
        fileName: 'Forwarded Message',
        fromPairId: pair.id,
      }).returning()
      const entry = entryArr[0]

      const baseUrl = env.WEB_ENDPOINT
      let messageText = richHeaderUsed ? '[转发消息]' : `${header}[转发消息]`

      if (baseUrl) {
        const webAppUrl = `${baseUrl}/chatRecord?tgWebAppStartParam=${entry.id}&uuid=${entry.id}`
        // mtcute 期望 { type: 'inline', buttons: [[{_: 'keyboardButtonUrl', ...}]] }
        const buttons = [[{ _: 'keyboardButtonUrl', text: '查看合并转发', url: webAppUrl }]]
        return await chat.sendMessage(messageText, {
          replyMarkup: { type: 'inline', buttons },
          replyTo: this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
          disableWebPreview: true,
        })
      }
      else {
        this.logger.warn('WEB_ENDPOINT is not set, sending forward link as plain text.')
        messageText += '\n(未配置 WEB_ENDPOINT，无法生成查看按钮)'
        return await chat.sendMessage(messageText, {
          replyTo: this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
          disableWebPreview: true,
        })
      }
    }
    catch (e) {
      this.logger.error(e, 'Failed to send forward message:')
      return await chat.sendMessage(this.contentRenderer(content).replace(/\\n/g, '\n'), {
        replyTo: this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId || pair?.tgThreadId),
      })
    }
  }
}
