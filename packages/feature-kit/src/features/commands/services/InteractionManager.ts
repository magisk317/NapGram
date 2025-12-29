import type { PendingAction } from '../types'

/**
 * 交互式命令管理器
 * 负责管理需要多步交互的命令状态（如 bind/unbind）
 */
export class InteractionManager {
  private pendingActions = new Map<string, PendingAction>()

  /**
   * 设置待处理的交互动作
   * @param chatId 聊天 ID
   * @param userId 用户 ID
   * @param action 待处理的动作
   */
  setPending(chatId: string | number, userId: string | number, action: PendingAction): void {
    const key = `${chatId}:${userId}`
    this.pendingActions.set(key, action)
  }

  /**
   * 获取待处理的交互动作
   * @param chatId 聊天 ID
   * @param userId 用户 ID
   * @returns 待处理的动作（如果存在）
   */
  getPending(chatId: string | number, userId: string | number): PendingAction | undefined {
    const key = `${chatId}:${userId}`
    return this.pendingActions.get(key)
  }

  /**
   * 删除待处理的交互动作
   * @param chatId 聊天 ID
   * @param userId 用户 ID
   */
  deletePending(chatId: string | number, userId: string | number): void {
    const key = `${chatId}:${userId}`
    this.pendingActions.delete(key)
  }

  /**
   * 检查是否有待处理的交互动作
   * @param chatId 聊天 ID
   * @param userId 用户 ID
   * @returns 是否有待处理的动作
   */
  hasPending(chatId: string | number, userId: string | number): boolean {
    const key = `${chatId}:${userId}`
    return this.pendingActions.has(key)
  }
}
