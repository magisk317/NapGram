import type { Message } from '@mtcute/core'
import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../shared-types'
import { messageConverter } from '@napgram/message-kit'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('MediaGroupHandler')

/**
 * Handles Telegram Media Group batching for TG→QQ forwarding.
 *
 * Buffers incoming media group messages with a delay, then forwards them
 * as a single QQ message with all images/videos combined.
 */
export class MediaGroupHandler {
  private mediaGroupBuffer = new Map<string, {
    messages: Message[]
    timer: NodeJS.Timeout
    pair: any
  }>()

  constructor(
    private readonly qqClient: IQQClient,
    private readonly prepareMediaForQQ: (msg: UnifiedMessage) => Promise<void>,
    private readonly getNicknameMode: (pair: any) => string,
  ) { }

  /**
   * Handle Media Group batching for TG->QQ
   * @returns true if the message is part of a media group and is buffered
   */
  async handleMediaGroup(tgMsg: Message, pair: any): Promise<boolean> {
    const groupId = (tgMsg as any).mediaGroupId || (tgMsg as any).raw?.groupedId?.toString()

    if (!groupId)
      return false // Not a media group

    logger.info(`[MediaGroup] Message ${tgMsg.id} belongs to group ${groupId}`)

    if (!this.mediaGroupBuffer.has(groupId)) {
      // First message in this group
      this.mediaGroupBuffer.set(groupId, {
        messages: [tgMsg],
        timer: setTimeout(() => {
          this.flushMediaGroup(groupId).catch((err) => {
            logger.error('Failed to flush media group:', err)
          })
        }, 1000), // 1 second delay
        pair,
      })
      logger.info(`[MediaGroup] Started buffer for group ${groupId}`)
    }
    else {
      // Subsequent message in same group
      const buffer = this.mediaGroupBuffer.get(groupId)!
      buffer.messages.push(tgMsg)

      // Reset timer
      clearTimeout(buffer.timer)
      buffer.timer = setTimeout(() => {
        this.flushMediaGroup(groupId).catch((err) => {
          logger.error('Failed to flush media group:', err)
        })
      }, 1000)
      logger.info(`[MediaGroup] Added message to group ${groupId} (total: ${buffer.messages.length})`)
    }

    return true // Message is buffered
  }

  /**
   * Flush buffered Media Group messages to QQ
   */
  private async flushMediaGroup(groupId: string) {
    const buffer = this.mediaGroupBuffer.get(groupId)
    if (!buffer)
      return

    this.mediaGroupBuffer.delete(groupId)
    logger.info(`[MediaGroup] Flushing group ${groupId} with ${buffer.messages.length} messages`)

    // Sort by message ID to preserve order
    buffer.messages.sort((a, b) => a.id - b.id)

    // Build QQ message chain
    const napCatSegments: any[] = []

    for (const msg of buffer.messages) {
      const unified = messageConverter.fromTelegram(msg as any)
      await this.prepareMediaForQQ(unified)

      // Extract media elements (image/video)
      const mediaContent = unified.content.filter(c => ['image', 'video'].includes(c.type))
      const segments = await messageConverter.toNapCat({ ...unified, content: mediaContent })
      napCatSegments.push(...segments)
    }

    // Get caption/text from any message in the group (find first non-empty text)
    // In Telegram Media Groups, caption can be on any photo, usually the first one
    let caption = ''
    for (const msg of buffer.messages) {
      if (msg.text && msg.text.trim()) {
        caption = msg.text
        break // Use first non-empty caption found
      }
    }
    if (caption) {
      napCatSegments.push({ type: 'text', data: { text: caption } })
    }

    const nicknameMode = this.getNicknameMode(buffer.pair)
    const showTGToQQNickname = nicknameMode[1] === '1'
    if (showTGToQQNickname) {
      const firstMsg = buffer.messages[0]
      const unified = messageConverter.fromTelegram(firstMsg as any)
      const headerText = `${unified.sender.name}:\n`
      napCatSegments.unshift({ type: 'text', data: { text: headerText } })
    }

    // Send to QQ
    try {
      // Use last message for metadata (ID, timestamp, etc)
      const lastMsg = buffer.messages[buffer.messages.length - 1]
      const msgWithSegments: UnifiedMessage = {
        id: String(lastMsg.id),
        platform: 'telegram' as const,
        chat: { id: String(buffer.pair.qqRoomId), type: 'group' as const, name: '' },
        sender: { id: String(lastMsg.sender?.id || '0'), name: '', avatar: '' },
        timestamp: Math.floor(lastMsg.date.getTime() / 1000),
        content: napCatSegments as any,
      };
      (msgWithSegments as any).__napCatSegments = true

      const receipt = await this.qqClient.sendMessage(String(buffer.pair.qqRoomId), msgWithSegments)

      if (receipt.success) {
        const msgId = receipt.messageId || (receipt as any).data?.message_id || (receipt as any).id
        logger.info(`[MediaGroup] Flushed group ${groupId} -> QQ ${buffer.pair.qqRoomId} (seq: ${msgId})`)
      }
    }
    catch (error) {
      logger.error(`[MediaGroup] Failed to flush group ${groupId}:`, error)
    }
  }

  /**
   * Destroy handler and clear all pending timers
   */
  destroy() {
    for (const buffer of this.mediaGroupBuffer.values()) {
      clearTimeout(buffer.timer)
    }
    this.mediaGroupBuffer.clear()
    logger.info('MediaGroupHandler destroyed')
  }
}
