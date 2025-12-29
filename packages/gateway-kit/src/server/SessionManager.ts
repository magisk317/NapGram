/**
 * Gateway 会话管理器
 * 管理 WebSocket 连接会话的生命周期
 */

import type { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { getLogger } from '../logger'

const logger = getLogger('SessionManager')

export interface Session {
  id: string
  ws: WebSocket
  authenticated: boolean
  userId?: string
  userName?: string
  instances: number[] // 允许访问的实例列表
  createdAt: number
  lastHeartbeat: number
}

export class SessionManager {
  private sessions = new Map<string, Session>()

  /**
   * 创建新会话
   */
  create(ws: WebSocket): string {
    const sessionId = randomUUID()
    const session: Session = {
      id: sessionId,
      ws,
      authenticated: false,
      instances: [],
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
    }

    this.sessions.set(sessionId, session)
    logger.info(`Session created: ${sessionId}`)
    return sessionId
  }

  /**
   * 获取会话
   */
  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 认证会话
   */
  authenticate(sessionId: string, userId: string, userName: string, instances: number[]): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    session.authenticated = true
    session.userId = userId
    session.userName = userName
    session.instances = instances
    logger.info(`Session authenticated: ${sessionId}, user: ${userId}, instances: ${instances.join(',')}`)
  }

  /**
   * 更新心跳时间
   */
  updateHeartbeat(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastHeartbeat = Date.now()
    }
  }

  /**
   * 销毁会话
   */
  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.sessions.delete(sessionId)
      logger.info(`Session destroyed: ${sessionId}`)
    }
  }

  /**
   * 获取指定实例的所有会话
   */
  getByScope(instanceId: number): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.authenticated && s.instances.includes(instanceId),
    )
  }

  /**
   * 清理超时会话（心跳超时）
   */
  cleanupStale(timeoutMs: number = 60000): void {
    const now = Date.now()
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastHeartbeat > timeoutMs) {
        logger.warn(`Session timeout: ${sessionId}`)
        session.ws.close(1000, 'Heartbeat timeout')
        this.destroy(sessionId)
      }
    }
  }

  /**
   * 获取所有会话统计
   */
  getStats() {
    const authenticated = Array.from(this.sessions.values()).filter(s => s.authenticated).length
    return {
      total: this.sessions.size,
      authenticated,
      unauthenticated: this.sessions.size - authenticated,
    }
  }
}
