import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../shared-types'
import type { CommandContext } from './CommandContext'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('BindCommandHandler')

/**
 * 绑定命令处理器
 */
export class BindCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const threadId = this.context.extractThreadId(msg, args)

    if (args.length < 1) {
      // 进入交互式绑定流程
      this.context.stateManager.setBindingState(msg.chat.id, msg.sender.id, threadId)

      const tip = `请输入要绑定的 QQ 群号...
(回复非数字取消)

提示：也可以直接发送完整命令，如：
/bind 123456 [topic_id]
(topic_id 可以省略，默认绑定当前话题)`

      await this.context.replyTG(msg.chat.id, tip, threadId)
      return
    }

    const qqGroupId = args[0]
    if (!/^-?\d+$/.test(qqGroupId)) {
      await this.context.replyTG(msg.chat.id, 'qq_group_id 必须是数字', threadId)
      return
    }

    const forwardMap = this.context.instance.forwardPairs as ForwardMap

    // 如果 TG 话题已被其他 QQ 占用，拒绝绑定
    const tgOccupied = forwardMap.findByTG(msg.chat.id, threadId, false)
    if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
      await this.context.replyTG(msg.chat.id, '该 TG 话题已绑定到其他 QQ 群', threadId)
      return
    }

    // add 会在已存在该 QQ 时更新 tgThreadId
    const rec = await forwardMap.add(qqGroupId, msg.chat.id, threadId)
    if (!rec) {
      await this.context.replyTG(msg.chat.id, '绑定失败：操作未生效，请重试', threadId)
      return
    }
    if (rec && rec.qqRoomId.toString() !== qqGroupId) {
      await this.context.replyTG(msg.chat.id, '绑定失败：检测到冲突，请检查现有绑定', threadId)
      return
    }

    const threadInfo = threadId ? ` (话题 ${threadId})` : ''
    await this.context.replyTG(msg.chat.id, `绑定成功：QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`, threadId)
    logger.info(`Bind command: QQ ${qqGroupId} <-> TG ${msg.chat.id}${threadInfo}`)
  }
}
