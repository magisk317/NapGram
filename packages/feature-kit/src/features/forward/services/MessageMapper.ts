import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import process from 'node:process'
import { db, schema, eq, and, desc } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'
import { renderContent } from '../utils/render'

export class ForwardMapper {
  private readonly logger = getLogger('ForwardFeature')

  constructor(
    private readonly contentRenderer: (content: MessageContent) => string = renderContent,
  ) { }

  private shouldSkipPersistence() {
    // Avoid touching the real database when running under Vitest/Node test runs
    return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
  }

  async saveTgToQqMapping(unified: UnifiedMessage, tgMsg: any, receipt: any, pair: any) {
    if (this.shouldSkipPersistence()) {
      return
    }
    const msgId = receipt?.messageId || receipt?.data?.message_id || receipt?.id
    if (!msgId) {
      this.logger.warn('TG->QQ forwarded but no messageId in receipt, cannot save mapping.')
      return
    }
    try {
      await db.insert(schema.message).values({
        qqRoomId: pair.qqRoomId,
        qqSenderId: BigInt(0),
        time: Math.floor(Date.now() / 1000),
        seq: Number(msgId),
        rand: BigInt(0),
        pktnum: 0,
        tgChatId: BigInt(pair.tgChatId),
        tgMsgId: tgMsg.id,
        tgSenderId: BigInt(tgMsg.sender?.id || 0),
        instanceId: pair.instanceId,
        brief: unified.content.map(c => this.contentRenderer(c)).join(' ').slice(0, 50),
      })
      this.logger.debug(`Saved TG->QQ mapping: seq=${msgId} <-> tgMsgId=${tgMsg.id}`)
    }
    catch (e) {
      this.logger.warn(e, 'Failed to save TG->QQ message mapping:')
    }
  }

  async saveMessage(qqMsg: UnifiedMessage, tgMsg: any, instanceId: number, qqRoomId: bigint, tgChatId: bigint) {
    if (this.shouldSkipPersistence()) {
      return
    }
    try {
      const raw = qqMsg.metadata?.raw || {}
      const seq = raw.message_id || raw.seq || 0
      const rand = raw.rand || 0
      const time = Math.floor(qqMsg.timestamp / 1000)
      const qqSenderId = BigInt(qqMsg.sender?.id ?? 0)
      const tgMsgId = tgMsg?.id ?? 0
      const tgSenderId = BigInt(tgMsg?.sender?.id ?? 0)

      await db.insert(schema.message).values({
        qqRoomId,
        qqSenderId,
        time,
        seq,
        rand: BigInt(rand),
        pktnum: 0,
        tgChatId,
        tgMsgId,
        tgSenderId,
        instanceId,
        brief: qqMsg.content.map(c => this.contentRenderer(c)).join(' ').slice(0, 50),
      })
    }
    catch (e) {
      this.logger.warn(e, 'Failed to save message mapping:')
    }
  }

  async findTgMsgId(instanceId: number, qqRoomId: bigint, qqMsgId: string): Promise<number | undefined> {
    const numericId = Number(qqMsgId)
    if (!Number.isNaN(numericId)) {
      this.logger.debug(`Finding TG Msg ID by seq: instanceId=${instanceId}, qqRoomId=${qqRoomId}, seq=${numericId}`)
      const bySeq = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, instanceId),
          eq(schema.message.qqRoomId, qqRoomId),
          eq(schema.message.seq, numericId),
        ),
      })
      if (bySeq) {
        this.logger.debug(`Found TG Msg ID by seq: ${bySeq.tgMsgId}`)
        return bySeq.tgMsgId
      }
    }

    if (this.shouldSkipPersistence()) {
      return undefined
    }

    if (!Number.isNaN(numericId)) {
      const senderId = BigInt(numericId)
      this.logger.debug(`Finding TG Msg ID by sender: instanceId=${instanceId}, qqRoomId=${qqRoomId}, sender=${senderId}`)
      const bySender = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, instanceId),
          eq(schema.message.qqRoomId, qqRoomId),
          eq(schema.message.qqSenderId, senderId),
        ),
        orderBy: [desc(schema.message.time)],
      })
      if (bySender) {
        this.logger.debug(`Found TG Msg ID by sender: ${bySender.tgMsgId}`)
        return bySender.tgMsgId
      }
    }

    this.logger.debug('TG Msg ID not found for reply')
    return undefined
  }

  async findQqSource(instanceId: number, tgChatId: number, tgMsgId: number) {
    if (this.shouldSkipPersistence()) {
      return undefined
    }
    this.logger.debug(`Finding QQ source: instanceId=${instanceId}, tgChatId=${tgChatId}, tgMsgId=${tgMsgId}`)
    const msg = await db.query.message.findFirst({
      where: and(
        eq(schema.message.tgChatId, BigInt(tgChatId)),
        eq(schema.message.tgMsgId, tgMsgId),
        eq(schema.message.instanceId, instanceId),
      ),
    })
    this.logger.debug(`Found QQ source: ${msg ? 'yes' : 'no'} (seq=${msg?.seq})`)
    return msg
  }
}
