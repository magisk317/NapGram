import type { Message } from '@mtcute/core'
import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../shared-types'
import type { ReplyResolver } from '../services/ReplyResolver'
import type { MediaGroupHandler } from './MediaGroupHandler'
import { messageConverter } from '@napgram/message-kit'
import { db, performanceMonitor, schema } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('ForwardFeature')

/**
 * Handles Telegram->QQ message forwarding
 */
export class TelegramMessageHandler {
  constructor(
    private readonly qqClient: IQQClient,
    private readonly mediaGroupHandler: MediaGroupHandler,
    private readonly replyResolver: ReplyResolver,
    private readonly prepareMediaForQQ: (msg: UnifiedMessage) => Promise<void>,
    private readonly renderContent: (content: any) => string,
    private readonly getNicknameMode: (pair: any) => string,
  ) { }

  async handleTGMessage(tgMsg: Message, pair: any, preUnified?: UnifiedMessage): Promise<void> {
    const startTime = Date.now()
    try {
      // Check if this is a Media Group message
      const isMediaGroup = await this.mediaGroupHandler.handleMediaGroup(tgMsg, pair)
      if (isMediaGroup) {
        // Message is buffered, skip normal processing
        return
      }

      const unified = preUnified ?? messageConverter.fromTelegram(tgMsg as any)
      await this.prepareMediaForQQ(unified)

      // 如果是回复，尝试找到对应的 QQ 消息 ID，构造 QQ 的 reply 段
      const qqReply = await this.replyResolver.resolveTGReply(
        tgMsg as any,
        pair.instanceId,
        Number(pair.tgChatId),
      )

      const replySegment = qqReply
        ? [{
          type: 'reply' as const,
          data: {
            id: String(qqReply.seq),
            seq: qqReply.seq,
            time: qqReply.time,
            senderUin: qqReply.senderUin,
            peer: {
              chatType: 2, // Group chat
              peerUid: String(qqReply.qqRoomId),
            },
          },
        }]
        : []

      // CRITICAL: Remove TG reply segments (contain TG message IDs like 637)
      // We'll add our own QQ reply segment with QQ message ID instead
      unified.content = unified.content.filter(c => c.type !== 'at' && c.type !== 'reply')

      // Strip explicit @mention from the beginning of the text if present
      const firstTextIndex = unified.content.findIndex(c => c.type === 'text')
      if (firstTextIndex !== -1) {
        const textData = unified.content[firstTextIndex].data as any
        if (textData.text) {
          const originalText = textData.text
          // Remove @username or @userid at the start, allowing for whitespace
          textData.text = textData.text.replace(/^\s*@\S+\s*/, '')
          if (originalText !== textData.text) {
            logger.debug(`Stripped mention from text: "${originalText}" -> "${textData.text}"`)
          }
        }
      }

      const hasMedia = unified.content.some(c => ['video', 'file'].includes(c.type))
      const hasSplitMedia = unified.content.some(c => ['audio', 'image'].includes(c.type))
      const nicknameMode = this.getNicknameMode(pair)
      const showTGToQQNickname = nicknameMode[1] === '1'

      let receipt

      if (hasMedia) {
        // 使用合并转发 (Video, File)
        const mediaSegments = [
          ...replySegment.map(r => ({ type: r.type, data: r.data })),
          ...(await messageConverter.toNapCat(unified)),
        ]

        // 构造提示语
        if (showTGToQQNickname) {
          let actionText = '发来一条消息'
          if (unified.content.some(c => c.type === 'video'))
            actionText = '发来一个视频'
          else if (unified.content.some(c => c.type === 'file'))
            actionText = '发来一个文件'

          // 发送提示消息
          try {
            let hintText = ''
            if (actionText) {
              hintText = `${unified.sender.name}：\n${actionText}`
            }
            else {
              hintText = `${unified.sender.name} ${actionText}` // Fallback
            }

            const hintMsg: UnifiedMessage = {
              id: `${unified.id}_hint`,
              platform: 'qq',
              sender: unified.sender,
              chat: { id: String(pair.qqRoomId), type: 'group' },
              content: [{ type: 'text', data: { text: hintText } }],
              timestamp: Date.now(),
            }
            await this.qqClient.sendMessage(String(pair.qqRoomId), hintMsg)
          }
          catch (e) {
            logger.warn('Failed to send hint message:', e)
          }
        }

        const node = {
          type: 'node',
          data: {
            name: showTGToQQNickname ? unified.sender.name : 'Anonymous', // 控制节点名称
            uin: this.qqClient.uin, // 使用 Bot 的 UIN，但显示 TG 用户名
            content: mediaSegments,
          },
        }

        receipt = await this.qqClient.sendGroupForwardMsg(String(pair.qqRoomId), [node])
      }
      else if (hasSplitMedia) {
        // 语音和图片消息特殊处理：分两次调用 API 发送
        let actionText = ''
        if (showTGToQQNickname) {
          if (unified.content.some(c => c.type === 'image'))
            actionText = '发来一张图片'
          else if (unified.content.some(c => c.type === 'audio'))
            actionText = '发来一条语音'
        }

        const headerText = showTGToQQNickname
          ? (actionText ? `${unified.sender.name}：\n${actionText}` : `${unified.sender.name}：\n`)
          : ''
        const textSegments = unified.content.filter(c =>
          !['audio', 'image'].includes(c.type)
          && !(c.type === 'text' && !c.data.text),
        )

        const hasContentToSend = headerText || textSegments.length > 0 || replySegment.length > 0

        if (hasContentToSend) {
          // Convert text segments to NapCat format first
          const textNapCatSegments = await messageConverter.toNapCat({
            ...unified,
            content: textSegments,
          })

          // Build final segments with reply
          const headerSegments = [
            ...replySegment.map(r => ({ type: r.type, data: r.data })),
            { type: 'text', data: { text: headerText } },
            ...textNapCatSegments,
          ]

          const headerMsg: UnifiedMessage = {
            ...unified,
            content: headerSegments as any,
          };
          // Mark as pre-converted to skip toNapCat in sendMessage
          (headerMsg as any).__napCatSegments = true

          // 发送 Header
          await this.qqClient.sendMessage(String(pair.qqRoomId), headerMsg)
        }

        // 2. 发送媒体 (Audio, Image)
        const mediaSegments = unified.content.filter(c => ['audio', 'image'].includes(c.type))
        const mediaMsg: UnifiedMessage = {
          ...unified,
          content: mediaSegments,
        }

        receipt = await this.qqClient.sendMessage(String(pair.qqRoomId), mediaMsg)
      }
      else {
        // 普通文本消息，保持原样
        const headerText = showTGToQQNickname ? `${unified.sender.name}:\n` : ''
        // Convert to NapCat segments first, then add reply
        const baseSegments = await messageConverter.toNapCat(unified)

        logger.debug('[Debug] replySegment before map:', JSON.stringify(replySegment, null, 2))

        const segments = [
          ...replySegment.map(r => ({ type: r.type, data: r.data })),
          { type: 'text', data: { text: headerText } },
          ...baseSegments,
        ]

        // Create message with NapCat segments
        unified.content = segments as any;
        // Mark as pre-converted to skip toNapCat conversion in sendMessage
        (unified as any).__napCatSegments = true

        unified.chat.id = String(pair.qqRoomId)
        unified.chat.type = 'group'

        receipt = await this.qqClient.sendMessage(String(pair.qqRoomId), unified)
      }

      if (receipt.success) {
        const msgId = receipt.messageId || (receipt as any).data?.message_id || (receipt as any).id
        logger.info(`[Forward][TG->QQ] message ${tgMsg.id} -> QQ ${pair.qqRoomId} (seq: ${msgId})`)
        // 📊 记录成功 - 计算处理延迟
        const latency = Date.now() - startTime
        performanceMonitor.recordMessage(latency)

        if (msgId) {
          // Save mapping for reply lookup (QQ -> TG reply)
          try {
            await db.insert(schema.message).values({
              qqRoomId: pair.qqRoomId,
              qqSenderId: BigInt(0), // Self sent
              time: Math.floor(Date.now() / 1000),
              seq: Number(msgId), // Store message_id as seq
              rand: BigInt(0),
              pktnum: 0,
              tgChatId: BigInt(pair.tgChatId),
              tgMsgId: tgMsg.id,
              tgSenderId: BigInt(tgMsg.sender.id || 0),
              instanceId: pair.instanceId,
              brief: unified.content.map(c => this.renderContent(c)).join(' ').slice(0, 50),
            })
            logger.debug(`Saved TG->QQ mapping: seq=${msgId} <-> tgMsgId=${tgMsg.id}`)
          }
          catch (e) {
            logger.warn('Failed to save TG->QQ message mapping:', e)
          }
        }
        else {
          logger.warn('TG->QQ forwarded but no messageId in receipt, cannot save mapping.')
        }
      }
      else if (receipt.error) {
        logger.warn(`TG message ${tgMsg.id} forwarded to QQ ${pair.qqRoomId} failed: ${receipt.error}`)
      }
    }
    catch (error) {
      // 📊 记录错误
      performanceMonitor.recordError()
      logger.error('Failed to forward TG message:', error)
    }
  }
}
