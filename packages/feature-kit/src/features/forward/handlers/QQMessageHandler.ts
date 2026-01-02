import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { Instance } from '../../../shared-types'
import type { TelegramSender } from '../senders/TelegramSender'
import type { ForwardModeService } from '../services/ForwardModeService'
import type { ForwardMapper } from '../services/MessageMapper'
import type { ReplyResolver } from '../services/ReplyResolver'
import { getEventPublisher } from '../../../shared-types'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('QQMessageHandler')

/**
 * QQ 消息处理器
 * 负责处理从 QQ 到 Telegram 的消息转发
 */
export class QQMessageHandler {
  constructor(
    private readonly instance: Instance,
    private readonly forwardMap: ForwardMap,
    private readonly modeService: ForwardModeService,
    private readonly mapper: ForwardMapper,
    private readonly replyResolver: ReplyResolver,
    private readonly telegramSender: TelegramSender,
  ) { }

  /**
   * 处理 QQ 消息
   */
  async handle(msg: UnifiedMessage): Promise<void> {
    // Check forward mode (QQ -> TG is index 0)
    if (!this.modeService.isQQToTGEnabled()) {
      return
    }

    try {
      const pair = this.forwardMap.findByQQ(msg.chat.id)
      if (!pair) {
        logger.debug(`No TG mapping for QQ chat ${msg.chat.id}`)
        return
      }

      const tgChatId = Number(pair.tgChatId)
      logger.info(`Forwarding using pair: QQ=${pair.qqRoomId} -> TG=${pair.tgChatId}, Thread=${pair.tgThreadId}`)
      const chat = await this.instance.tgBot.getChat(tgChatId)

      // 处理回复
      const replyToMsgId = await this.replyResolver.resolveQQReply(msg, pair.instanceId, pair.qqRoomId)

      const sentMsg = await this.telegramSender.sendToTelegram(chat, msg, pair, replyToMsgId, this.modeService.nicknameMode)

      if (sentMsg) {
        await this.mapper.saveMessage(msg, sentMsg, pair.instanceId, pair.qqRoomId, BigInt(tgChatId))
        logger.info(`QQ message ${msg.id} forwarded to TG ${tgChatId} (TG ID: ${sentMsg.id})`)

        // 发布消息事件到插件系统（QQ 侧消息）
        try {
          const eventPublisher = getEventPublisher()
          const qqClient = this.instance.qqClient
          if (!qqClient)
            throw new Error('QQ client not initialized')

          const contentToText = () => {
            const parts = (msg.content || [])
              .filter((c: any) => c?.type === 'text' && c?.data?.text)
              .map((c: any) => String(c.data.text))
            return parts.join(' ').trim()
          }

          const channelType
            = msg.chat.type === 'private'
              ? 'private'
              : msg.chat.type === 'group'
                ? 'group'
                : 'group'

          eventPublisher.publishMessage({
            instanceId: pair.instanceId,
            platform: 'qq',
            channelId: String(msg.chat.id),
            channelType,
            sender: {
              userId: `qq:u:${msg.sender.id}`,
              userName: msg.sender.name,
            },
            message: {
              id: String(msg.id),
              text: contentToText(),
              segments: msg.content as any,
              timestamp: msg.timestamp || Date.now(),
            },
            raw: msg,
            reply: async (content) => {
              const text = typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content.map((x: any) => (x?.type === 'text' ? String(x.data?.text ?? '') : '')).join('')
                  : String(content ?? '')
              const receipt = await qqClient.sendMessage(String(msg.chat.id), {
                id: `plugin-reply-${Date.now()}`,
                platform: 'qq',
                sender: { id: String(qqClient.uin), name: qqClient.nickname, isBot: true },
                chat: { id: String(msg.chat.id), type: msg.chat.type },
                content: [{ type: 'text', data: { text } }],
                timestamp: Date.now(),
              } as any)
              return { messageId: receipt.messageId }
            },
            send: async (content) => {
              const text = typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content.map((x: any) => (x?.type === 'text' ? String(x.data?.text ?? '') : '')).join('')
                  : String(content ?? '')
              const receipt = await qqClient.sendMessage(String(msg.chat.id), {
                id: `plugin-send-${Date.now()}`,
                platform: 'qq',
                sender: { id: String(qqClient.uin), name: qqClient.nickname, isBot: true },
                chat: { id: String(msg.chat.id), type: msg.chat.type },
                content: [{ type: 'text', data: { text } }],
                timestamp: Date.now(),
              } as any)
              return { messageId: receipt.messageId }
            },
            recall: async () => {
              logger.warn('[Plugin] Recall not implemented for QQ events')
            },
          })
        }
        catch (publishError) {
          logger.warn('Failed to publish QQ message event to plugin system:', publishError)
        }
      }
    }
    catch (error) {
      logger.error(error, 'Failed to forward QQ message:')
    }
  }
}
