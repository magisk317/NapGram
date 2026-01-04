import type { Message } from '@mtcute/core'
import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import type { ForwardPairRecord } from '../../shared-types'
import type { ForwardMap } from '../../shared-types'
import type { Instance } from '../../shared-types'
import type { IQQClient } from '../../shared-types'
import type { Telegram } from '../../shared-types'
import type { MessageSegment } from '../../shared-types'
import type { CommandsFeature } from '../commands/CommandsFeature'
import type { MediaFeature } from '../MediaFeature'
import { messageConverter } from '@napgram/message-kit'
import { db, env, schema, eq } from '@napgram/infra-kit'
import { performanceMonitor } from '../../shared-types'
import { getEventPublisher } from '../../shared-types'
import { getLogger } from '@napgram/infra-kit'
import { ThreadIdExtractor } from '../commands/services/ThreadIdExtractor'
import { MediaGroupHandler } from './handlers/MediaGroupHandler'
import { TelegramMessageHandler } from './handlers/TelegramMessageHandler'
import { ForwardMediaPreparer } from './senders/MediaPreparer'
import { TelegramSender } from './senders/TelegramSender'
import { ForwardMapper } from './services/MessageMapper'
import { ReplyResolver } from './services/ReplyResolver'
import { MessageUtils } from './utils/MessageUtils'

const logger = getLogger('ForwardFeature')

/**
 * 基于新架构的简化转发实现（NapCat <-> Telegram）。
 */
export class ForwardFeature {
  private forwardMap: ForwardMap
  private telegramSender: TelegramSender
  private mapper: ForwardMapper
  private replyResolver: ReplyResolver
  private mediaGroupHandler: MediaGroupHandler
  private tgMessageHandler: TelegramMessageHandler
  private mediaPreparer: ForwardMediaPreparer
  private processedMsgIds = new Set<string>()
  private handleTgMessage = async (tgMsg: Message) => {
    const rawText = tgMsg.text || ''
    logger.debug('[Forward][TG->QQ] incoming', {
      id: tgMsg.id,
      chatId: tgMsg.chat.id,
      text: rawText.slice(0, 100),
    })

    const threadId = new ThreadIdExtractor().extractFromRaw((tgMsg as any).raw || tgMsg)

    const pair = this.forwardMap.findByTG(
      tgMsg.chat.id,
      threadId,
      !threadId, // 如果有 threadId，禁用 fallback，避免落到 general
    )
    if (!pair) {
      logger.debug(`No QQ mapping for TG chat ${tgMsg.chat.id} thread ${threadId || 'none'}`)
      return
    }

    logger.debug('[Forward][TG->QQ] resolved', {
      tgMsgId: tgMsg.id,
      tgChatId: tgMsg.chat.id,
      threadId,
      qqRoomId: pair.qqRoomId,
    })

    let unified: UnifiedMessage | undefined
    try {
      unified = messageConverter.fromTelegram(tgMsg as any)
    }
    catch (e) {
      logger.debug(e, '[Forward] Failed to convert TG message')
    }

    await this.publishTgPluginEvent(tgMsg, pair, unified, threadId)

    // Publish gateway event (doesn't affect forwarding)
    try {
      const gatewayMessage = unified ?? messageConverter.fromTelegram(tgMsg as any)
      await getEventPublisher().publishMessageCreated(this.instance.id, gatewayMessage as any, pair)
    }
    catch (e) {
      logger.debug(e, '[Gateway] publishMessageCreated (TG) failed')
    }

    if (rawText.trim().startsWith('/')) {
      logger.debug({ text: rawText }, '[Forward] Skipping command message')
      return
    }

    // Check forward mode (TG -> QQ is index 1)
    const forwardMode = this.getForwardMode(pair)
    if (forwardMode[1] === '0') {
      logger.debug(`Forward TG->QQ disabled for chat ${tgMsg.chat.id} (mode: ${forwardMode})`)
      return
    }

    await this.tgMessageHandler.handleTGMessage(tgMsg, pair, unified)
  }

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
    private readonly media?: MediaFeature,
    private readonly commands?: CommandsFeature,
  ) {
    const pairs = instance.forwardPairs
    const isForwardMap = pairs && typeof (pairs as any).findByQQ === 'function' && typeof (pairs as any).findByTG === 'function'
    if (!isForwardMap) {
      throw new Error('Forward map is not initialized for NapCat pipeline.')
    }
    this.forwardMap = pairs as ForwardMap
    this.telegramSender = new TelegramSender(instance, media)
    this.mapper = new ForwardMapper()
    this.replyResolver = new ReplyResolver(this.mapper)
    this.mediaPreparer = new ForwardMediaPreparer(instance, media)
    this.mediaGroupHandler = new MediaGroupHandler(
      this.qqClient,
      msg => this.mediaPreparer.prepareMediaForQQ(msg),
      pair => this.getNicknameMode(pair),
    )
    this.tgMessageHandler = new TelegramMessageHandler(
      this.qqClient,
      this.mediaGroupHandler,
      this.replyResolver,
      msg => this.mediaPreparer.prepareMediaForQQ(msg),
      this.renderContent.bind(this),
      pair => this.getNicknameMode(pair),
    )
    this.setupListeners()
    logger.info('ForwardFeature ✓ 初始化完成')

    // Register commands
    if (this.commands) {
      this.commands.registerCommand({
        name: 'mode',
        aliases: ['模式'],
        description: '控制昵称显示和转发开关 (QQ->TG/TG->QQ)',
        usage: '/mode <nickname|forward> <00|01|10|11>',
        handler: this.handleModeCommand,
        adminOnly: true,
      })
    }
  }

  private setupListeners() {
    this.qqClient.on('message', this.handleQQMessage)
    this.qqClient.on('poke', this.handlePokeEvent)
    this.tgBot.addNewMessageEventHandler(this.handleTgMessage)
    logger.debug('[ForwardFeature] listeners attached')
  }

  /**
   * 获取指定 pair 的转发模式配置
   * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
   */
  private getForwardMode(pair: ForwardPairRecord): string {
    return pair.forwardMode || env.FORWARD_MODE
  }

  /**
   * 获取指定 pair 的昵称模式配置
   * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
   */
  private getNicknameMode(pair: ForwardPairRecord): string {
    return pair.nicknameMode || env.SHOW_NICKNAME_MODE
  }

  private toPluginSegments(contents: MessageContent[], platform: 'qq' | 'tg'): MessageSegment[] {
    const out: MessageSegment[] = []
    for (const c of contents || []) {
      if (!c)
        continue
      switch (c.type) {
        case 'text':
          out.push({ type: 'text', data: { text: String((c.data as any)?.text ?? '') } })
          break
        case 'at':
          out.push({
            type: 'at',
            data: {
              userId: String((c.data as any)?.userId ?? ''),
              userName: (c.data as any)?.userName ? String((c.data as any).userName) : undefined,
            },
          })
          break
        case 'reply':
          out.push({ type: 'reply', data: { messageId: String((c.data as any)?.messageId ?? '') } })
          break
        case 'image': {
          const data = c.data as any
          out.push({
            type: 'image',
            data: { url: typeof data?.url === 'string' ? data.url : undefined, file: typeof data?.file === 'string' ? data.file : undefined },
          })
          break
        }
        case 'video': {
          const data = c.data as any
          out.push({
            type: 'video',
            data: { url: typeof data?.url === 'string' ? data.url : undefined, file: typeof data?.file === 'string' ? data.file : undefined },
          })
          break
        }
        case 'audio': {
          const data = c.data as any
          out.push({
            type: 'audio',
            data: { url: typeof data?.url === 'string' ? data.url : undefined, file: typeof data?.file === 'string' ? data.file : undefined },
          })
          break
        }
        case 'file': {
          const data = c.data as any
          out.push({
            type: 'file',
            data: {
              url: typeof data?.url === 'string' ? data.url : undefined,
              file: typeof data?.file === 'string' ? data.file : undefined,
              name: data?.filename ? String(data.filename) : undefined,
            },
          })
          break
        }
        case 'forward': {
          const msgs = Array.isArray((c.data as any)?.messages) ? (c.data as any).messages : []
          out.push({
            type: 'forward',
            data: {
              messages: msgs.map((m: UnifiedMessage) => ({
                userId: String(m?.sender?.id ?? ''),
                userName: String(m?.sender?.name ?? ''),
                segments: this.toPluginSegments(m?.content || [], platform),
              })),
            },
          })
          break
        }
        default:
          out.push({ type: 'raw', data: { platform, content: c } })
          break
      }
    }
    return out
  }

  private contentToText(content: string | any[]): string {
    if (typeof content === 'string')
      return content
    if (!Array.isArray(content))
      return String(content ?? '')
    return content
      .map((seg: any) => {
        if (!seg)
          return ''
        if (typeof seg === 'string')
          return seg
        if (seg.type === 'text')
          return String(seg.data?.text ?? '')
        if (seg.type === 'at')
          return seg.data?.userName ? `@${seg.data.userName}` : '@'
        return ''
      })
      .filter(Boolean)
      .join('')
  }

  private async publishTgPluginEvent(
    tgMsg: Message,
    pair: ForwardPairRecord,
    unified: UnifiedMessage | undefined,
    threadId?: number,
  ) {
    try {
      const eventPublisher = getEventPublisher()
      const message = unified ?? messageConverter.fromTelegram(tgMsg as any)
      const segments = this.toPluginSegments(message.content as any, 'tg')
      const text = this.contentToText(segments)
      const timestamp = tgMsg.date ? (typeof tgMsg.date === 'number' ? tgMsg.date : tgMsg.date.getTime()) : Date.now()

      eventPublisher.publishMessage({
        eventId: `tg:${tgMsg.id}`,
        instanceId: pair.instanceId,
        platform: 'tg',
        channelId: String(tgMsg.chat.id),
        channelType: 'group',
        threadId,
        sender: {
          userId: `tg:u:${tgMsg.sender?.id || 0}`,
          userName: tgMsg.sender?.displayName || tgMsg.sender?.username || 'Unknown',
        },
        message: {
          id: String(tgMsg.id),
          text,
          segments,
          timestamp,
        },
        raw: tgMsg,
        reply: async (content) => {
          const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
          const replyText = this.contentToText(content)
          const params: any = { replyTo: tgMsg.id }
          if (threadId)
            params.messageThreadId = threadId
          const sent = await chat.sendMessage(replyText, params)
          return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
        },
        send: async (content) => {
          const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
          const sendText = this.contentToText(content)
          const params: any = {}
          if (threadId)
            params.messageThreadId = threadId
          const sent = await chat.sendMessage(sendText, params)
          return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
        },
        recall: async () => {
          const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
          await chat.deleteMessages([tgMsg.id])
        },
      })
    }
    catch (e) {
      logger.debug(e, '[Plugin] publishMessage (TG) failed')
    }
  }

  private handleQQMessage = async (msg: UnifiedMessage) => {
    const startTime = Date.now() // 📊 开始计时
    const text = (msg.content || [])
      .filter(c => c.type === 'text')
      .map(c => (c.data as any).text || '')
      .join('')
      .trim()

    // Deduplication check
    if (this.processedMsgIds.has(String(msg.id))) {
      logger.info(`[Forward] Duplicate QQ message ignored: ${msg.id}`)
      return
    }
    this.processedMsgIds.add(String(msg.id))
    // Clear cache after 30 seconds
    setTimeout(() => {
      this.processedMsgIds.delete(String(msg.id))
    }, 30 * 1000)

    const isCommand = text.startsWith('/')

    try {
      // Publish plugin event (doesn't affect forwarding)
      try {
        const eventPublisher = getEventPublisher()

        const channelType
          = msg.chat.type === 'private'
            ? 'private'
            : msg.chat.type === 'group'
              ? 'group'
              : 'group'

        const segments = this.toPluginSegments(msg.content as any, 'qq')

        eventPublisher.publishMessage({
          eventId: `qq:${msg.id}`,
          instanceId: this.instance.id,
          platform: 'qq',
          channelId: String(msg.chat.id),
          channelType,
          sender: {
            userId: `qq:u:${msg.sender?.id || ''}`,
            userName: msg.sender?.name || 'Unknown',
          },
          message: {
            id: String(msg.id),
            text,
            segments,
            timestamp: msg.timestamp || Date.now(),
          },
          raw: msg,
          reply: async (content) => {
            const text = this.contentToText(content)
            const receipt = await this.qqClient.sendMessage(String(msg.chat.id), {
              id: `plugin-reply-${Date.now()}`,
              platform: 'qq',
              sender: { id: String(this.qqClient.uin), name: this.qqClient.nickname, isBot: true },
              chat: { id: String(msg.chat.id), type: msg.chat.type },
              content: [
                { type: 'reply', data: { messageId: String(msg.id), senderId: '', senderName: '' } },
                { type: 'text', data: { text } },
              ],
              timestamp: Date.now(),
            } as any)
            return { messageId: `qq:${String(receipt.messageId)}`, timestamp: Date.now() }
          },
          send: async (content) => {
            const text = this.contentToText(content)
            const receipt = await this.qqClient.sendMessage(String(msg.chat.id), {
              id: `plugin-send-${Date.now()}`,
              platform: 'qq',
              sender: { id: String(this.qqClient.uin), name: this.qqClient.nickname, isBot: true },
              chat: { id: String(msg.chat.id), type: msg.chat.type },
              content: [{ type: 'text', data: { text } }],
              timestamp: Date.now(),
            } as any)
            return { messageId: `qq:${String(receipt.messageId)}`, timestamp: Date.now() }
          },
          recall: async () => {
            await this.qqClient.recallMessage(String(msg.id))
          },
        })
      }
      catch (e) {
        logger.debug(e, '[Plugin] publishMessage (QQ) failed')
      }

      if (isCommand) {
        logger.debug({ text }, '[Forward] Skipping command message')
        return
      }

      const pair = this.forwardMap.findByQQ(msg.chat.id)
      if (!pair) {
        logger.debug(`No TG mapping for QQ chat ${msg.chat.id}`)
        return
      }

      // Publish gateway event (doesn't affect forwarding)
      try {
        await getEventPublisher().publishMessageCreated(this.instance.id, msg as any, pair)
      }
      catch (e) {
        logger.debug(e, '[Gateway] publishMessageCreated (QQ) failed')
      }

      // Check forward mode (QQ -> TG is index 0)
      const forwardMode = this.getForwardMode(pair)
      if (forwardMode[0] === '0') {
        logger.debug(`Forward QQ->TG disabled for chat ${msg.chat.id} (mode: ${forwardMode})`)
        return
      }

      logger.info('[Forward][QQ->TG] incoming', {
        qqMsgId: msg.id,
        qqRoomId: msg.chat.id,
        tgChatId: pair.tgChatId,
      })

      // Sender Blocklist Filter
      if (pair.ignoreSenders) {
        const senders = pair.ignoreSenders.split(',').map(s => s.trim())
        // Check if current sender is in the blocklist
        // Provide fallback for msg.sender.id (though it should exist)
        const senderId = String(msg.sender?.id || '')
        if (senders.includes(senderId)) {
          logger.info(`Ignored QQ message ${msg.id} from sender ${senderId} (in blocklist)`)
          return
        }
      }

      // Regex Deduplication Filter
      if (pair.ignoreRegex) {
        try {
          const regex = new RegExp(pair.ignoreRegex)
          // Extract text content for matching
          const textContent = msg.content
            .filter(c => c.type === 'text')
            .map(c => (c.data as any).text || '')
            .join('')

          if (regex.test(textContent)) {
            logger.info(`Ignored QQ message ${msg.id} matched regex: ${pair.ignoreRegex}`)
            return
          }
        }
        catch (e) {
          logger.warn(`Invalid ignoreRegex for pair ${pair.id}: ${pair.ignoreRegex}`, e)
        }
      }

      // 填充 @ 提及的展示名称：优先群名片，其次昵称，最后 QQ 号
      await MessageUtils.populateAtDisplayNames(msg, this.qqClient)

      const tgChatId = Number(pair.tgChatId)
      const chat = await this.instance.tgBot.getChat(tgChatId)

      // 处理回复 - 使用 ReplyResolver
      const replyToMsgId = await this.replyResolver.resolveQQReply(msg, pair.instanceId, pair.qqRoomId)

      const sentMsg = await this.telegramSender.sendToTelegram(chat, msg, pair, replyToMsgId, this.getNicknameMode(pair))

      if (sentMsg) {
        await this.mapper.saveMessage(msg, sentMsg, pair.instanceId, pair.qqRoomId, BigInt(tgChatId))

        // 📊 记录成功 - 计算处理延迟
        const latency = Date.now() - startTime
        performanceMonitor.recordMessage(latency)

        logger.info(`[Forward][QQ->TG] message ${msg.id} -> TG ${tgChatId} (id: ${sentMsg.id}) in ${latency}ms`)
      }
    }
    catch (error) {
      // 📊 记录错误
      performanceMonitor.recordError()
      logger.error('Failed to forward QQ message:', error)
    }
  }

  private handleModeCommand = async (msg: UnifiedMessage, args: string[]) => {
    const chatId = msg.chat.id
    // Extract threadId from raw message
    // Extract threadId from raw message
    const raw = (msg.metadata as any)?.raw
    // Do not use .extract(msg, args) here because args may contain numbers (e.g. "10" for mode) that are NOT threadId
    const threadId = new ThreadIdExtractor().extractFromRaw(raw)

    if (!MessageUtils.isAdmin(msg.sender.id, this.instance)) {
      await MessageUtils.replyTG(this.tgBot, chatId, '您没有权限执行此命令', threadId)
      return
    }

    const type = args[0]
    const value = args[1]

    if (!type || !value || !/^[01]{2}$/.test(value)) {
      await MessageUtils.replyTG(this.tgBot, chatId, '用法：/mode <nickname|forward> <00|01|10|11>\n示例：/mode nickname 10 (QQ→TG显示昵称，TG→QQ不显示)', threadId)
      return
    }

    // 查找当前聊天对应的 pair
    const pair = this.forwardMap.findByTG(chatId, threadId, !threadId)
    if (!pair) {
      await MessageUtils.replyTG(this.tgBot, chatId, '错误：未找到对应的转发配置', threadId)
      return
    }

    try {
      // 更新数据库
      const updateData: any = {}
      if (type === 'nickname') {
        updateData.nicknameMode = value
      }
      else if (type === 'forward') {
        updateData.forwardMode = value
      }
      else {
        await MessageUtils.replyTG(this.tgBot, chatId, '未知模式类型，请使用 nickname 或 forward', threadId)
        return
      }

      await db.update(schema.forwardPair)
        .set(updateData)
        .where(eq(schema.forwardPair.id, pair.id))

      // 同步更新内存中的 pair 对象（立即生效）
      if (type === 'nickname') {
        pair.nicknameMode = value
      }
      else {
        pair.forwardMode = value
      }

      const modeName = type === 'nickname' ? '昵称显示模式' : '转发模式'
      await MessageUtils.replyTG(this.tgBot, chatId, `${modeName}已更新为: ${value}`, threadId)
      logger.info(`Updated ${type} mode to ${value} for pair ${pair.id} (QQ: ${pair.qqRoomId}, TG: ${pair.tgChatId})`)
    }
    catch (error) {
      logger.error('Failed to update mode:', error)
      await MessageUtils.replyTG(this.tgBot, chatId, '更新失败，请查看日志', threadId)
    }
  }

  private renderContent(content: MessageContent): string {
    switch (content.type) {
      case 'text':
        // NapCat 上报的文本有时会把换行编码为字面 "\n"，这里还原为真实换行
        return (content.data.text || '').replace(/\\n/g, '\n')
      case 'image':
        return '[图片]'
      case 'video':
        return '[视频]'
      case 'audio':
        return '[语音]'
      case 'file':
        return `[文件:${content.data.filename || '文件'}]`
      case 'at':
        return `@${content.data.userName || content.data.userId}`
      case 'face':
        return content.data.text || '[表情]'
      case 'reply':
        return `(回复 ${content.data.messageId}${content.data.text ? `:${content.data.text}` : ''})`
      case 'forward':
        return `[转发消息x${content.data.messages?.length ?? 0}]`
      case 'location':
        return `[位置:${content.data.title ?? ''} ${content.data.latitude},${content.data.longitude}]`

      default:
        return `[${content.type}]`
    }
  }

  private handlePokeEvent = async (groupId: string, operatorId: string, targetId: string) => {
    try {
      // Find mapping for this group
      const pair = this.forwardMap.findByQQ(groupId)
      if (!pair)
        return

      // Check if forwarding is enabled (QQ->TG)
      const forwardMode = this.getForwardMode(pair)
      if (forwardMode[0] === '0')
        return

      const tgChatId = Number(pair.tgChatId)

      let msgText = ''
      if (operatorId === targetId) {
        msgText = `User ${operatorId} poked themselves`
      }
      else {
        msgText = `👉 User ${operatorId} poked ${targetId}`

        // Try to get names/cards for better display
        try {
          const opInfo = await this.qqClient.getGroupMemberInfo(groupId, operatorId)
          const targetInfo = await this.qqClient.getGroupMemberInfo(groupId, targetId)
          const opName = opInfo?.card || opInfo?.nickname || operatorId
          const targetName = targetInfo?.card || targetInfo?.nickname || targetId
          msgText = `👉 ${opName} 戳了戳 ${targetName}`
        }
        catch {
          // ignore errors fetching names
        }
      }

      await MessageUtils.replyTG(this.tgBot, tgChatId, msgText, pair.tgThreadId)
    }
    catch (error) {
      logger.error('Failed to handle poke event:', error)
    }
  }


  destroy() {
    this.mediaGroupHandler.destroy()
    this.qqClient.removeListener('message', this.handleQQMessage)
    this.qqClient.removeListener('poke', this.handlePokeEvent)
    this.tgBot.removeNewMessageEventHandler(this.handleTgMessage)
    logger.info('ForwardFeature destroyed')
  }
}

export default ForwardFeature

