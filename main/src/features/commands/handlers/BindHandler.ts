import { getLogger } from '../../../shared/utils/logger';
import type { UnifiedMessage } from '../../../domain/message';
import type { CommandHandler } from '../types';
import type Instance from '../../../domain/models/Instance';
import ForwardMap from '../../../domain/models/ForwardMap';
import { TelegramReply } from '../utils/TelegramReply';
import { ThreadIdExtractor } from '../services/ThreadIdExtractor';
import { InteractionManager } from '../services/InteractionManager';

const logger = getLogger('BindHandler');

/**
 * 绑定命令处理器
 */
export class BindHandler {
    constructor(
        private readonly instance: Instance,
        private readonly telegramReply: TelegramReply,
        private readonly threadExtractor: ThreadIdExtractor,
        private readonly interactionManager: InteractionManager,
    ) { }

    /**
     * 处理绑定命令
     */
    handle: CommandHandler = async (msg: UnifiedMessage, args: string[]) => {
        if (args.length < 1) {
            // 进入交互式询问 QQ 群号
            const threadId = this.threadExtractor.extract(msg, args);
            this.interactionManager.setPending(msg.chat.id, msg.sender.id, {
                action: 'bind',
                threadId,
            });
            await this.telegramReply.send(
                msg.chat.id,
                '请输入要绑定的 QQ 群号',
                threadId,
                (msg.metadata as any)?.raw,
            );
            return;
        }

        const qqGroupId = args[0];
        if (!/^-?\d+$/.test(qqGroupId)) {
            await this.telegramReply.send(msg.chat.id, 'qq_group_id 必须是数字');
            return;
        }

        const threadId = this.threadExtractor.extract(msg, args);
        const forwardMap = this.instance.forwardPairs as ForwardMap;

        // 如果 TG 话题已被其他 QQ 占用，拒绝绑定
        const tgOccupied = forwardMap.findByTG(msg.chat.id, threadId, false);
        if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
            await this.telegramReply.send(msg.chat.id, '该 TG 话题已绑定到其他 QQ 群');
            return;
        }

        // add 会在已存在该 QQ 时更新 tgThreadId
        const rec = await forwardMap.add(qqGroupId, msg.chat.id, threadId);
        if (rec && rec.qqRoomId.toString() !== qqGroupId) {
            await this.telegramReply.send(msg.chat.id, '绑定失败：检测到冲突，请检查现有绑定');
            return;
        }

        const threadInfo = threadId ? ` (话题 ${threadId})` : '';
        await this.telegramReply.send(
            msg.chat.id,
            `绑定成功：QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`,
            threadId,
            (msg.metadata as any)?.raw,
        );
        logger.info(`Bind command: QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`);
    };
}
