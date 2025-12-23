/**
 * Gateway 协议帧定义
 * 参考 NapGram-Gateway-Design.md
 */

// ============= 基础帧结构 =============
export interface BaseFrame {
  op: string // 操作类型
  v: number // 协议版本
  t: number // 时间戳 (ms)
}

// ============= Hello 帧 (服务器 → 客户端) =============
export interface HelloFrame extends BaseFrame {
  op: 'hello'
  data: {
    sessionId: string
    heartbeatMs: number
    server: {
      name: string
      version: string
    }
    capabilities: string[]
    resume: {
      supported: boolean
      bufferMs: number
    }
  }
}

// ============= Identify 帧 (客户端 → 服务器) =============
export interface IdentifyFrame extends BaseFrame {
  op: 'identify'
  data: {
    token: string
    scope: {
      instances: number[] // 允许访问的实例列表
    }
    resume?: {
      sessionId: string
      lastSeq: number
    }
  }
}

// ============= Ready 帧 (服务器 → 客户端) =============
export interface ReadyFrame extends BaseFrame {
  op: 'ready'
  data: {
    user: {
      id: string
      name: string
    }
    instances: Array<{
      id: number
      name: string
      pairs?: Array<{
        pairId: number
        qq: {
          channelId: string
          roomId: string
          name?: string | null
        }
        tg: {
          channelId: string
          chatId: string
          threadId?: number | null
          name?: string | null
        }
      }>
    }>
  }
}

// ============= Ping/Pong (心跳) =============
export interface PingFrame extends BaseFrame {
  op: 'ping'
  data?: null
}

export interface PongFrame extends BaseFrame {
  op: 'pong'
  data?: null
}

// ============= Event 帧 (服务器 → 客户端) =============
export interface EventFrame extends BaseFrame {
  op: 'event'
  data: {
    seq: number
    type: string
    instanceId: number
    [key: string]: any // 事件特定数据
  }
}

// ============= Call 帧 (客户端 → 服务器，RPC 请求) =============
export interface CallFrame extends BaseFrame {
  op: 'call'
  data: {
    id: string // 请求ID（用于匹配响应）
    instanceId?: number // 可选：目标实例ID（未提供时默认 0）
    action: string // 动作名称，如 "message.send"
    params: any // 动作参数
  }
}

// ============= Result 帧 (服务器 → 客户端，RPC 响应) =============
export interface ResultFrame extends BaseFrame {
  op: 'result'
  data: {
    id: string // 对应的请求ID
    success: boolean
    result?: any // 成功时的返回值
    error?: {
      code: string
      message: string
      details?: any
    }
  }
}

// ============= Error 帧 (服务器 → 客户端) =============
export interface ErrorFrame extends BaseFrame {
  op: 'error'
  data: {
    code: string
    message: string
    fatal?: boolean // 是否致命错误（需断开连接）
  }
}

// ============= 联合类型 =============
export type Frame
  = | HelloFrame
    | IdentifyFrame
    | ReadyFrame
    | PingFrame
    | PongFrame
    | EventFrame
    | CallFrame
    | ResultFrame
    | ErrorFrame

// ============= 帧创建辅助函数 =============
export function createHelloFrame(sessionId: string): HelloFrame {
  return {
    op: 'hello',
    v: 1,
    t: Date.now(),
    data: {
      sessionId,
      heartbeatMs: 30000,
      server: {
        name: 'NapGram',
        version: '0.1.0',
      },
      capabilities: ['events', 'actions', 'media.ref'],
      resume: {
        supported: false,
        bufferMs: 0,
      },
    },
  }
}

export function createReadyFrame(userId: string, userName: string, instances: Array<{ id: number, name: string }>): ReadyFrame {
  return {
    op: 'ready',
    v: 1,
    t: Date.now(),
    data: {
      user: { id: userId, name: userName },
      instances,
    },
  }
}

export function createErrorFrame(code: string, message: string, fatal = false): ErrorFrame {
  return {
    op: 'error',
    v: 1,
    t: Date.now(),
    data: { code, message, fatal },
  }
}

export function createPongFrame(): PongFrame {
  return {
    op: 'pong',
    v: 1,
    t: Date.now(),
  }
}
