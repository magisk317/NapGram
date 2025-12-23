interface BindingState {
  threadId?: number
  userId: string
  timestamp: number
}

/**
 * 交互式状态管理器（用于多步骤命令）
 */
export class InteractiveStateManager {
  // Key: `${chatId}:${userId}`
  private bindingStates = new Map<string, BindingState>()
  private readonly TIMEOUT_MS = 5 * 60 * 1000 // 5分钟超时

  /**
   * 设置绑定状态
   */
  setBindingState(chatId: string, userId: string, threadId?: number) {
    const key = `${chatId}:${userId}`
    this.bindingStates.set(key, {
      threadId,
      userId,
      timestamp: Date.now(),
    })
  }

  /**
   * 获取绑定状态
   */
  getBindingState(chatId: string, userId: string): BindingState | undefined {
    const key = `${chatId}:${userId}`
    return this.bindingStates.get(key)
  }

  /**
   * 删除绑定状态
   */
  deleteBindingState(chatId: string, userId: string) {
    const key = `${chatId}:${userId}`
    this.bindingStates.delete(key)
  }

  /**
   * 检查状态是否超时
   */
  isTimeout(state: BindingState): boolean {
    return Date.now() - state.timestamp > this.TIMEOUT_MS
  }

  /**
   * 清理所有过期状态
   */
  cleanupExpired() {
    const now = Date.now()
    for (const [key, state] of this.bindingStates.entries()) {
      if (now - state.timestamp > this.TIMEOUT_MS) {
        this.bindingStates.delete(key)
      }
    }
  }
}
