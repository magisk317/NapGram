import { getLogger } from '../../../shared/utils/logger';
import type { MessageContent, UnifiedMessage } from '../../../domain/message';
import type { Message } from '@mtcute/core';
import db from '../../../domain/models/db';
import type { ForwardPair, MessageMapping } from '../types';
import { renderContent } from '../utils/render';

export class ForwardMapper {
    private readonly logger = getLogger('ForwardFeature');

    constructor(
        private readonly contentRenderer: (content: MessageContent) => string = renderContent,
    ) { }

    async saveTgToQqMapping(unified: UnifiedMessage, tgMsg: any, receipt: any, pair: any) {
        const msgId = receipt?.messageId || receipt?.data?.message_id || receipt?.id;
        if (!msgId) {
            this.logger.warn('TG->QQ forwarded but no messageId in receipt, cannot save mapping.');
            return;
        }
        try {
            await db.message.create({
                data: {
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
                }
            });
            this.logger.debug(`Saved TG->QQ mapping: seq=${msgId} <-> tgMsgId=${tgMsg.id}`);
        } catch (e) {
            this.logger.warn(e, 'Failed to save TG->QQ message mapping:');
        }
    }

    async saveMessage(qqMsg: UnifiedMessage, tgMsg: any, instanceId: number, qqRoomId: bigint, tgChatId: bigint) {
        try {
            const raw = qqMsg.metadata?.raw || {};
            const seq = raw.message_id || raw.seq || 0;
            const rand = raw.rand || 0;
            const time = Math.floor(qqMsg.timestamp / 1000);
            const qqSenderId = BigInt(qqMsg.sender.id);

            await db.message.create({
                data: {
                    qqRoomId,
                    qqSenderId,
                    time,
                    seq,
                    rand: BigInt(rand),
                    pktnum: 0,
                    tgChatId,
                    tgMsgId: tgMsg.id,
                    tgSenderId: BigInt(tgMsg.sender.id || 0),
                    instanceId,
                    brief: qqMsg.content.map(c => this.contentRenderer(c)).join(' ').slice(0, 50),
                }
            });
        } catch (e) {
            this.logger.warn(e, 'Failed to save message mapping:');
        }
    }

    async findTgMsgId(instanceId: number, qqRoomId: bigint, qqMsgId: string): Promise<number | undefined> {
        const numericId = Number(qqMsgId);
        if (!isNaN(numericId)) {
            this.logger.debug(`Finding TG Msg ID by seq: instanceId=${instanceId}, qqRoomId=${qqRoomId}, seq=${numericId}`);
            const bySeq = await db.message.findFirst({
                where: {
                    instanceId,
                    qqRoomId,
                    seq: numericId,
                }
            });
            if (bySeq) {
                this.logger.debug(`Found TG Msg ID by seq: ${bySeq.tgMsgId}`);
                return bySeq.tgMsgId;
            }
        }

        if (!isNaN(numericId)) {
            const senderId = BigInt(numericId);
            this.logger.debug(`Finding TG Msg ID by sender: instanceId=${instanceId}, qqRoomId=${qqRoomId}, sender=${senderId}`);
            const bySender = await db.message.findFirst({
                where: {
                    instanceId,
                    qqRoomId,
                    qqSenderId: senderId,
                },
                orderBy: {
                    time: 'desc',
                },
            });
            if (bySender) {
                this.logger.debug(`Found TG Msg ID by sender: ${bySender.tgMsgId}`);
                return bySender.tgMsgId;
            }
        }

        this.logger.debug('TG Msg ID not found for reply');
        return undefined;
    }

    async findQqSource(instanceId: number, tgChatId: number, tgMsgId: number) {
        this.logger.debug(`Finding QQ source: instanceId=${instanceId}, tgChatId=${tgChatId}, tgMsgId=${tgMsgId}`);
        const msg = await db.message.findFirst({
            where: {
                tgChatId: BigInt(tgChatId),
                tgMsgId,
                instanceId,
            },
        });
        this.logger.debug(`Found QQ source: ${msg ? 'yes' : 'no'} (seq=${msg?.seq})`);
        return msg;
    }
}
