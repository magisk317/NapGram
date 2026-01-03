/**
 * NapGram 原生插件系统 - 核心接口定义
 *
 * 本文件定义了 NapGram 插件系统的所有核心接口和类型。
 * 这些接口构成了独立于任何第三方框架的插件 API。
 */

// ============================================================================
// 插件定义
// ============================================================================

/**
 * NapGram 插件定义
 *
 * 所有插件必须实现此接口（或导出符合此结构的默认对象）
 */
export interface NapGramPlugin {
  /** 插件唯一标识（推荐格式: 'author-name' 或 'com.author.name'） */
  id: string

  /** 插件展示名称 */
  name: string

  /** 插件版本（语义化版本号） */
  version: string

  /** 插件作者 */
  author?: string

  /** 插件描述 */
  description?: string

  /** 插件主页 */
  homepage?: string

  /** 默认配置（可选） */
  defaultConfig?: any

  /** 所需权限 */
  permissions?: PluginPermissions

  /**
   * 插件安装
   *
   * 在插件加载时调用，用于初始化插件、注册事件监听器等
   *
   * @param ctx 插件上下文
   * @param config 插件配置（来自 plugins.yaml）
   */
  install: (ctx: PluginContext, config?: any) => void | Promise<void>

  /**
   * 插件卸载
   *
   * 在插件被移除或系统关闭时调用，用于清理资源
   */
  uninstall?: () => void | Promise<void>

  /**
   * 插件重载
   *
   * 在插件配置更新时调用
   */
  reload?: () => void | Promise<void>

  /**
   * Drizzle ORM Schema
   * 
   * 用于自动注册插件的数据库表结构
   */
  drizzleSchema?: Record<string, unknown>
}

// ============================================================================
// 权限系统
// ============================================================================

/**
 * 插件权限声明
 *
 * 插件需要声明所需的权限，未声明的权限将被拒绝
 */
export interface PluginPermissions {
  /** 可访问的实例 ID 列表（undefined = 所有实例） */
  instances?: number[]

  /** 网络访问权限 */
  network?: NetworkPermission

  /** 文件系统权限 */
  filesystem?: FilesystemPermission

  /** 数据库访问权限 */
  database?: DatabasePermission
}

export interface NetworkPermission {
  /** 是否启用网络访问 */
  enabled: boolean

  /** 允许访问的域名列表（支持通配符，如 '*.example.com'） */
  allowList?: string[]
}

export interface FilesystemPermission {
  /** 是否启用文件系统访问 */
  enabled: boolean

  /** 允许访问的路径列表（必须在 DATA_DIR 下） */
  allowList?: string[]
}

export interface DatabasePermission {
  /** 是否启用数据库访问 */
  enabled: boolean

  /** 允许访问的表名列表 */
  tables?: string[]
}

// ============================================================================
// 插件上下文
// ============================================================================

/**
 * 插件上下文
 *
 * 提供给插件的运行环境，包含事件监听、API 访问、日志、存储等功能
 */
export interface PluginContext {
  /** 插件 ID */
  readonly pluginId: string

  /** 日志记录器 */
  readonly logger: PluginLogger

  /** 插件配置 */
  readonly config: any

  /** 存储 API */
  readonly storage: PluginStorage

  /** 数据库 API (Drizzle Client) */
  readonly database: any

  // === 事件监听 ===

  /**
   * 监听消息事件
   *
   * @param event 事件名称
   * @param handler 事件处理器
   * @returns 事件订阅句柄
   */
  on: ((event: 'message', handler: MessageEventHandler) => EventSubscription) & ((event: 'friend-request', handler: FriendRequestEventHandler) => EventSubscription) & ((event: 'group-request', handler: GroupRequestEventHandler) => EventSubscription) & ((event: 'notice', handler: NoticeEventHandler) => EventSubscription) & ((event: 'instance-status', handler: InstanceStatusEventHandler) => EventSubscription) & ((event: 'plugin-reload', handler: PluginReloadEventHandler) => EventSubscription)

  // === API 访问 ===

  /** 消息 API */
  readonly message: MessageAPI

  /** 实例 API */
  readonly instance: InstanceAPI

  /** 用户 API */
  readonly user: UserAPI

  /** 群组 API */
  readonly group: GroupAPI

  /** Web API（注册管理路由） */
  readonly web: WebAPI

  // === 命令注册 ===

  /**
   * 注册命令
   *
   * @param config 命令配置
   * @returns 当前上下文（支持链式调用）
   */
  command: (config: CommandConfig) => this

  // === 生命周期钩子 ===

  /**
   * 注册重载钩子
   *
   * 在插件重载前调用
   */
  onReload: (callback: () => void | Promise<void>) => void

  /**
   * 注册卸载钩子
   *
   * 在插件卸载前调用
   */
  onUnload: (callback: () => void | Promise<void>) => void
}

/**
 * 事件订阅句柄
 */
export interface EventSubscription {
  /** 取消订阅 */
  unsubscribe: () => void
}

// ============================================================================
// 事件定义
// ============================================================================

/**
 * 消息事件
 */
export interface MessageEvent {
  /** 事件唯一 ID */
  eventId: string

  /** 实例 ID */
  instanceId: number

  /** 消息来源平台 */
  platform: 'qq' | 'tg'

  /** 频道 ID */
  channelId: string

  /**
   * 频道引用（建议插件优先使用，用于 MessageAPI 路由）
   *
   * 格式约定：
   * - QQ：`qq:group:<id>` / `qq:private:<id>`
   * - TG：`tg:<chatId>`
   */
  channelRef?: string

  /** 频道类型 */
  channelType: 'group' | 'private' | 'channel'

  threadId?: number

  /** QQ 客户端 API（若可用） */
  qq?: any

  /** Telegram 客户端 API（若可用） */
  tg?: any

  /** 实例 API（若可用） */
  instance?: any

  /** 发送者信息 */
  sender: {
    /** 用户 ID */
    userId: string
    /** 用户名 */
    userName: string
    /** 用户昵称（群昵称或备注） */
    userNick?: string
    /** 是否为管理员 */
    isAdmin?: boolean
    /** 是否为群主 */
    isOwner?: boolean
  }

  /** 消息内容 */
  message: {
    /** 消息 ID */
    id: string

    /**
     * 消息引用（建议插件优先使用，用于 recall/get 路由）
     *
     * 格式约定：
     * - QQ：`qq:<messageId>`
     * - TG：`tg:<chatId>:<messageId>`
     */
    ref?: string

    /** 纯文本内容 */
    text: string
    /** 消息片段 */
    segments: MessageSegment[]
    /** 消息时间戳（毫秒） */
    timestamp: number
    /** 引用的消息 */
    quote?: {
      id: string
      userId: string
      text: string
    }
  }

  /** 原始消息对象（平台特定） */
  raw: any

  /** 日志记录器（若可用） */
  logger?: PluginLogger

  // === 便捷方法 ===

  /**
   * 回复消息
   *
   * @param content 消息内容（字符串或片段数组）
   * @returns 发送结果
   */
  reply: (content: string | MessageSegment[]) => Promise<SendMessageResult>

  /**
   * 发送消息到当前频道
   *
   * @param content 消息内容
   * @returns 发送结果
   */
  send: (content: string | MessageSegment[]) => Promise<SendMessageResult>

  /**
   * 撤回本消息
   */
  recall: () => Promise<void>
}

/**
 * 好友请求事件
 */
export interface FriendRequestEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  requestId: string
  userId: string
  userName: string
  comment?: string
  timestamp: number

  /** 同意请求 */
  approve: () => Promise<void>

  /** 拒绝请求 */
  reject: (reason?: string) => Promise<void>
}

/**
 * 群组请求事件
 */
export interface GroupRequestEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  requestId: string
  groupId: string
  userId: string
  userName: string
  comment?: string
  subType?: 'add' | 'invite'
  timestamp: number

  /** 同意请求 */
  approve: () => Promise<void>

  /** 拒绝请求 */
  reject: (reason?: string) => Promise<void>
}

/**
 * 通知事件
 */
export interface NoticeEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  noticeType: NoticeType
  groupId?: string
  userId?: string
  operatorId?: string
  duration?: number
  timestamp: number
  raw: any
}

export type NoticeType
  = | 'group-member-increase'
  | 'group-member-decrease'
  | 'group-admin'
  | 'group-ban'
  | 'group-recall'
  | 'friend-add'
  | 'friend-recall'
  | 'connection-lost'
  | 'connection-restored'
  | 'other'

/**
 * 实例状态事件
 */
export interface InstanceStatusEvent {
  instanceId: number
  status: InstanceStatus
  error?: Error
  timestamp: number
}

export type InstanceStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

/**
 * 插件重载事件
 */
export interface PluginReloadEvent {
  pluginId: string
  timestamp: number
}

// ============================================================================
// 消息片段
// ============================================================================

/**
 * 消息片段（统一的消息表示）
 */
export type MessageSegment
  = | TextSegment
  | AtSegment
  | ReplySegment
  | ImageSegment
  | VideoSegment
  | AudioSegment
  | FileSegment
  | ForwardSegment
  | FaceSegment
  | RawSegment

export interface TextSegment {
  type: 'text'
  data: {
    text: string
  }
}

export interface AtSegment {
  type: 'at'
  data: {
    userId: string
    userName?: string
  }
}

export interface ReplySegment {
  type: 'reply'
  data: {
    messageId: string
    senderId?: string
    userId?: string
  }
}

export interface ImageSegment {
  type: 'image'
  data: {
    /** 图片 URL */
    url?: string
    /** 本地文件路径 */
    file?: string
    /** Base64 编码的图片数据 */
    base64?: string
  }
}

export interface VideoSegment {
  type: 'video'
  data: {
    url?: string
    file?: string
  }
}

export interface AudioSegment {
  type: 'audio'
  data: {
    url?: string
    file?: string
  }
}

export interface FaceSegment {
  type: 'face'
  data: {
    id: string
    text?: string
  }
}

export interface FileSegment {
  type: 'file'
  data: {
    url?: string
    file?: string
    name?: string
  }
}

export interface ForwardSegment {
  type: 'forward'
  data: {
    messages: ForwardMessage[]
  }
}

export interface ForwardMessage {
  userId: string
  userName: string
  segments: MessageSegment[]
}

export interface RawSegment {
  type: 'raw'
  data: {
    platform: 'qq' | 'tg'
    content: any
  }
}

// ============================================================================
// API 接口
// ============================================================================

/**
 * 消息 API
 */
export interface MessageAPI {
  /**
   * 发送消息
   */
  send: (params: SendMessageParams) => Promise<SendMessageResult>

  /**
   * 撤回消息
   */
  recall: (params: RecallMessageParams) => Promise<void>

  /**
   * 获取消息
   */
  get: (params: GetMessageParams) => Promise<MessageInfo | null>
}

export interface SendMessageParams {
  instanceId: number
  channelId: string
  content: string | MessageSegment[]
  threadId?: number
  replyTo?: string
}

export interface SendMessageResult {
  messageId: string
  timestamp: number
}

export interface RecallMessageParams {
  instanceId: number
  messageId: string
}

export interface GetMessageParams {
  instanceId: number
  messageId: string
}

export interface MessageInfo {
  id: string
  channelId: string
  userId: string
  text: string
  segments: MessageSegment[]
  timestamp: number
}

/**
 * 实例 API
 */
export interface InstanceAPI {
  /**
   * 获取所有实例
   */
  list: () => Promise<InstanceInfo[]>

  /**
   * 获取单个实例
   */
  get: (instanceId: number) => Promise<InstanceInfo | null>

  /**
   * 获取实例状态
   */
  getStatus: (instanceId: number) => Promise<InstanceStatus>
}

export interface InstanceInfo {
  id: number
  name?: string
  qqAccount?: string
  tgAccount?: string
  createdAt: Date
}

/**
 * 用户 API
 */
export interface UserAPI {
  /**
   * 获取用户信息
   */
  getInfo: (params: GetUserParams) => Promise<UserInfo | null>

  /**
   * 检查是否为好友
   */
  isFriend: (params: GetUserParams) => Promise<boolean>
}

export interface GetUserParams {
  instanceId: number
  userId: string
}

export interface UserInfo {
  userId: string
  userName: string
  userNick?: string
  avatar?: string
}

/**
 * 群组 API
 */
export interface GroupAPI {
  /**
   * 获取群组信息
   */
  getInfo: (params: GetGroupParams) => Promise<GroupInfo | null>

  /**
   * 获取群成员列表
   */
  getMembers: (params: GetGroupParams) => Promise<GroupMember[]>

  /**
   * 设置管理员
   */
  setAdmin: (params: SetAdminParams) => Promise<void>

  /**
   * 禁言用户
   */
  muteUser: (params: MuteUserParams) => Promise<void>

  /**
   * 踢出用户
   */
  kickUser: (params: KickUserParams) => Promise<void>
}

export interface GetGroupParams {
  instanceId: number
  groupId: string
}

export interface GroupInfo {
  groupId: string
  groupName: string
  memberCount?: number
}

export interface GroupMember {
  userId: string
  userName: string
  userNick?: string
  role: 'owner' | 'admin' | 'member'
}

export interface SetAdminParams {
  instanceId: number
  groupId: string
  userId: string
  enable: boolean
}

export interface MuteUserParams {
  instanceId: number
  groupId: string
  userId: string
  duration: number
}

export interface KickUserParams {
  instanceId: number
  groupId: string
  userId: string
  rejectAddRequest?: boolean
}

/**
 * Web API
 */
export interface WebAPI {
  /**
   * 注册 Web 路由
   */
  registerRoutes: (register: (app: any) => void, pluginId?: string) => void
}

/**
 * 插件存储 API
 */
export interface PluginStorage {
  /**
   * 获取数据
   */
  get: <T = any>(key: string) => Promise<T | null>

  /**
   * 设置数据
   */
  set: <T = any>(key: string, value: T) => Promise<void>

  /**
   * 删除数据
   */
  delete: (key: string) => Promise<void>

  /**
   * 列出所有键
   */
  keys: () => Promise<string[]>

  /**
   * 清空所有数据
   */
  clear: () => Promise<void>
}

/**
 * 插件日志 API
 */
export interface PluginLogger {
  /**
   * 调试级别日志
   */
  debug: (message: any, ...args: any[]) => void

  /**
   * 信息级别日志
   */
  info: (message: any, ...args: any[]) => void

  /**
   * 警告级别日志
   */
  warn: (message: any, ...args: any[]) => void

  /**
   * 错误级别日志
   */
  error: (message: any, ...args: any[]) => void
}

// ============================================================================
// 事件处理器类型
// ============================================================================

export type MessageEventHandler = (event: MessageEvent) => void | Promise<void>
export type FriendRequestEventHandler = (event: FriendRequestEvent) => void | Promise<void>
export type GroupRequestEventHandler = (event: GroupRequestEvent) => void | Promise<void>
export type NoticeEventHandler = (event: NoticeEvent) => void | Promise<void>
export type InstanceStatusEventHandler = (event: InstanceStatusEvent) => void | Promise<void>
export type PluginReloadEventHandler = (event: PluginReloadEvent) => void | Promise<void>

// ============================================================================
// 通用类型
// ============================================================================

/**
 * 插件加载规范
 */
export interface PluginSpec {
  /** 插件 ID */
  id: string

  /** 插件模块路径 */
  module: string

  /** 是否启用 */
  enabled: boolean

  /** 插件配置 */
  config?: any

  /** 插件来源信息（用于 Marketplace） */
  source?: {
    type: 'marketplace' | 'local'
    version?: string
    url?: string
  }

  /**
   * 加载插件模块的函数
   *
   * 设计说明：
   * - 返回值允许是 NapGramPlugin（原生插件对象）或任意"模块导出对象"
   * - 具体类型识别与验证在 PluginLoader 中完成
   */
  load?: () => Promise<any>
}

// ============================================================================
// 命令系统
// ============================================================================

/**
 * 命令配置
 */
export interface CommandConfig {
  /** 命令名称（不含前缀，如 'help' 而非 '/help'） */
  name: string

  /** 命令别名列表 */
  aliases?: string[]

  /** 命令描述 */
  description?: string

  /** 命令用法说明 */
  usage?: string

  /** 是否仅管理员可用 */
  adminOnly?: boolean

  /** 命令处理器 */
  handler: CommandHandler
}

/**
 * 命令处理器
 *
 * @param event 消息事件（触发命令的消息）
 * @param args 命令参数（不含命令名本身，已按空格分割）
 */
export type CommandHandler = (event: MessageEvent, args: string[]) => void | Promise<void>
