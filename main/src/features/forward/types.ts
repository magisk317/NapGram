/**
 * 转发模式配置
 * 格式: "XY" 其中 X 表示 QQ->TG, Y 表示 TG->QQ
 * 0 = 关闭, 1 = 开启
 */
export type ForwardMode = '00' | '01' | '10' | '11'

/**
 * 昵称显示模式配置
 * 格式: "XY" 其中 X 表示 QQ->TG, Y 表示 TG->QQ
 * 0 = 不显示昵称, 1 = 显示昵称
 */
export type NicknameMode = '00' | '01' | '10' | '11'

/**
 * 转发对信息
 */
export interface ForwardPair {
  instanceId: number
  qqRoomId: bigint
  tgChatId: bigint
  tgThreadId?: number | null
}

/**
 * 消息映射记录
 */
export interface MessageMapping {
  instanceId: number
  qqRoomId: bigint
  qqMsgId: string
  tgChatId: bigint
  tgMsgId: number
  seq?: bigint
}
