import type { Buffer } from 'node:buffer'
/**
 * Gateway WebSocket 服务器
 * 端口: 8765 (根据用户确认)
 * 协议: NapGram Gateway v1
 */

import type {
  CallFrame,
  Frame,
  IdentifyFrame,
  PingFrame,
} from '../protocol/frames'
import type { Session } from './SessionManager'
import type { GatewayPairRecord } from '../types'
import { WebSocket, WebSocketServer } from 'ws'
import { getLogger } from '../logger'
import {
  createErrorFrame,
  createHelloFrame,
  createPongFrame,
  createReadyFrame,
} from '../protocol/frames'
import { AuthManager } from './AuthManager'
import { SessionManager } from './SessionManager'

const logger = getLogger('GatewayServer')

export class GatewayServer {
  private wss: WebSocketServer
  private sessions: SessionManager
  private auth: AuthManager
  private heartbeatInterval?: NodeJS.Timeout

  constructor(
    private readonly port: number = 8765,
    private readonly opts?: {
      resolveExecutor?: (instanceId: number) => any
      resolvePairs?: (instanceId: number) => GatewayPairRecord[]
    },
  ) {
    this.sessions = new SessionManager()
    this.auth = new AuthManager()
    this.wss = new WebSocketServer({ port: this.port })
    this.setupHandlers()
    this.startHeartbeatCheck()
    logger.info(`Gateway Server started on port ${this.port}`)
  }

  private setupHandlers() {
    this.wss.on('connection', async (ws: WebSocket, req) => {
      const sessionId = this.sessions.create(ws)
      logger.info(`New connection: ${sessionId} from ${req.socket.remoteAddress}`)

      // 发送 Hello 帧
      const hello = createHelloFrame(sessionId)
      this.send(ws, hello)

      // 设置消息处理器
      ws.on('message', (data: Buffer) => {
        this.handleMessage(sessionId, data).catch((err) => {
          logger.error(`Error handling message for ${sessionId}:`, err)
          this.send(ws, createErrorFrame(
            'INTERNAL_ERROR',
            'Internal server error',
            false,
          ))
        })
      })

      // 处理连接关闭
      ws.on('close', (code, reason) => {
        logger.info(`Connection closed: ${sessionId}, code: ${code}, reason: ${reason}`)
        this.sessions.destroy(sessionId)
      })

      // 处理错误
      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${sessionId}:`, error)
        this.sessions.destroy(sessionId)
      })
    })

    this.wss.on('error', (error) => {
      logger.error('Gateway Server error:', error)
    })
  }

  private async handleMessage(sessionId: string, data: Buffer) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      logger.warn(`Message from unknown session: ${sessionId}`)
      return
    }

    try {
      const frame: Frame = JSON.parse(data.toString())
      logger.debug(`Received frame: ${frame.op} from session ${sessionId}`)

      switch (frame.op) {
        case 'identify':
          await this.handleIdentify(session, frame as IdentifyFrame)
          break

        case 'call':
          await this.handleCall(session, frame as CallFrame)
          break

        case 'ping':
          this.handlePing(session, frame as PingFrame)
          break

        default:
          logger.warn(`Unknown op: ${frame.op} from session ${sessionId}`)
          this.send(session.ws, createErrorFrame(
            'UNKNOWN_OP',
            `Unknown operation: ${frame.op}`,
            false,
          ))
      }
    }
    catch (error: any) {
      logger.error(`Failed to parse frame from ${sessionId}:`, error)
      this.send(session.ws, createErrorFrame(
        'INVALID_FRAME',
        'Invalid JSON frame',
        false,
      ))
    }
  }

  private async handleIdentify(session: Session, frame: IdentifyFrame) {
    logger.info(`Identify request from session ${session.id}`)

    // 验证 Token
    const authResult = await this.auth.authenticate(frame.data.token)
    if (!authResult.success) {
      logger.warn(`Authentication failed for session ${session.id}: ${authResult.error}`)
      this.send(session.ws, createErrorFrame(
        'AUTH_FAILED',
        authResult.error || 'Authentication failed',
        true,
      ))
      session.ws.close(4001, 'Authentication failed')
      return
    }

    const requestedInstances = Array.isArray(frame.data.scope?.instances) ? frame.data.scope.instances : []
    const allowedInstances = Array.isArray(authResult.instances) ? authResult.instances : []
    const instances = requestedInstances.filter(id => allowedInstances.includes(id))
    if (!instances.length) {
      this.send(session.ws, createErrorFrame(
        'FORBIDDEN',
        'No allowed instances in scope',
        true,
      ))
      session.ws.close(4003, 'Forbidden')
      return
    }

    // 认证成功
    this.sessions.authenticate(
      session.id,
      authResult.userId!,
      authResult.userName!,
      instances,
    )

    // 发送 Ready 帧
    const ready = createReadyFrame(
      authResult.userId!,
      authResult.userName!,
      instances.map(id => ({
        id,
        name: `Instance ${id}`,
        pairs: this.buildPairsMeta(id),
      })),
    )
    this.send(session.ws, ready)

    logger.info(`Session ${session.id} authenticated as ${authResult.userName}`)
  }

  private buildPairsMeta(instanceId: number) {
    const pairs = this.opts?.resolvePairs?.(instanceId) || []
    return pairs.map(pair => ({
      pairId: pair.id,
      qq: {
        channelId: `qq:g:${pair.qqRoomId.toString()}`,
        roomId: pair.qqRoomId.toString(),
        name: null,
      },
      tg: {
        channelId: pair.tgThreadId
          ? `tg:c:${pair.tgChatId.toString()}:t:${pair.tgThreadId}`
          : `tg:c:${pair.tgChatId.toString()}`,
        chatId: pair.tgChatId.toString(),
        threadId: pair.tgThreadId ?? null,
        name: null,
      },
    }))
  }

  private async handleCall(session: Session, frame: CallFrame) {
    // 检查是否已认证
    if (!session.authenticated) {
      this.send(session.ws, createErrorFrame(
        'NOT_AUTHENTICATED',
        'Must identify before calling actions',
        false,
      ))
      return
    }

    const instanceId
      = (frame.data as any).instanceId
        ?? (frame.data.params && typeof frame.data.params === 'object' ? (frame.data.params as any).instanceId : undefined)
        ?? 0

    if (!session.instances.includes(instanceId)) {
      this.send(session.ws, {
        op: 'result',
        v: 1,
        t: Date.now(),
        data: {
          id: frame.data.id,
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Not allowed to access instance ${instanceId}`,
          },
        },
      })
      return
    }

    logger.info(`Call action: ${frame.data.action} from session ${session.id} (instance ${instanceId})`)

    try {
      const executor = this.opts?.resolveExecutor?.(instanceId)
      if (!executor) {
        this.send(session.ws, {
          op: 'result',
          v: 1,
          t: Date.now(),
          data: {
            id: frame.data.id,
            success: false,
            error: {
              code: 'NOT_READY',
              message: `Instance ${instanceId} is not ready`,
            },
          },
        })
        return
      }

      const result = await executor.execute(frame.data.action, frame.data.params)
      this.send(session.ws, {
        op: 'result',
        v: 1,
        t: Date.now(),
        data: {
          id: frame.data.id,
          success: true,
          result,
        },
      })
    }
    catch (error: any) {
      logger.error(`Action execution failed: ${error.message}`)
      this.send(session.ws, {
        op: 'result',
        v: 1,
        t: Date.now(),
        data: {
          id: frame.data.id,
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: error.message,
          },
        },
      })
    }
  }

  private handlePing(session: Session, _frame: PingFrame) {
    this.sessions.updateHeartbeat(session.id)
    const pong = createPongFrame()
    this.send(session.ws, pong)
    logger.debug(`Heartbeat from session ${session.id}`)
  }

  /**
   * 发送帧到客户端
   */
  private send(ws: WebSocket, frame: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame))
    }
  }

  /**
   * 发布事件到所有订阅该实例的会话
   * @param instanceId 实例ID
   * @param event 事件数据
   */
  async publishEvent(instanceId: number, event: any) {
    const sessions = this.sessions.getByScope(instanceId)
    logger.debug(`Publishing event to ${sessions.length} sessions for instance ${instanceId}`)

    const eventFrame = {
      op: 'event',
      v: 1,
      t: Date.now(),
      data: event,
    }

    for (const session of sessions) {
      this.send(session.ws, eventFrame)
    }
  }

  /**
   * 启动心跳检查（每30秒检查一次）
   */
  private startHeartbeatCheck() {
    this.heartbeatInterval = setInterval(() => {
      this.sessions.cleanupStale(60000) // 60秒超时
    }, 30000)
  }

  /**
   * 停止服务器
   */
  async stop() {
    logger.info('Stopping Gateway Server...')

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        logger.info('Gateway Server stopped')
        resolve()
      })
    })
  }

  /**
   * 获取服务器统计信息
   */
  getStats() {
    return {
      port: this.port,
      sessions: this.sessions.getStats(),
    }
  }
}
