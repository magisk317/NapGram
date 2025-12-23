import type { Buffer } from 'node:buffer'
import type { EventEmitter } from 'node:events'
import type {
  Chat,
  MessageReceipt,
  RecallEvent,
  Sender,
  UnifiedMessage,
} from '../../../domain/message/types'
import type { ForwardMessage } from './types'

// ============ Phase 3: 请求事件类型 ============

export interface FriendRequestEvent {
  flag: string
  userId: string
  comment: string
  timestamp: number
}

export interface GroupRequestEvent {
  flag: string
  groupId: string
  userId: string
  subType: 'add' | 'invite'
  comment: string
  timestamp: number
}

/**
 * QQ 客户端统一接口
 * Phase 1: 所有 QQ 客户端实现都必须遵循这个接口
 */
export interface IQQClient extends EventEmitter {
  // ============ 基础信息 ============

  /** QQ 号 */
  readonly uin: number

  /** 昵称 */
  readonly nickname: string

  /** 客户端类型 */
  readonly clientType: 'napcat'

  /** 是否在线 */
  isOnline: () => Promise<boolean>

  // ============ 消息操作 ============

  /**
   * 发送消息
   * @param chatId 聊天 ID（群号或 QQ 号）
   * @param message 统一消息格式
   * @returns 消息回执
   */
  sendMessage: (chatId: string, message: UnifiedMessage) => Promise<MessageReceipt>

  /**
   * 发送群合并转发消息
   * @param groupId 群号
   * @param messages 转发节点列表
   */
  sendGroupForwardMsg: (groupId: string, messages: any[]) => Promise<MessageReceipt>

  /**
   * 撤回消息
   * @param messageId 消息 ID
   */
  recallMessage: (messageId: string) => Promise<void>

  /**
   * 获取消息
   * @param messageId 消息 ID
   */
  getMessage: (messageId: string) => Promise<UnifiedMessage | null>

  /**
   * 获取合并转发消息
   * @param messageId 合并转发的 resid
   */
  getForwardMsg: (messageId: string, fileName?: string) => Promise<ForwardMessage[]>

  /**
   * 获取文件直链或本地路径（NapCat get_file）
   */
  getFile?: (fileId: string) => Promise<any>

  /**
   * 透传 OneBot API 调用（NapLink）
   */
  callApi?: (method: string, params?: any) => Promise<any>

  // ============ NapLink OneBot API（可选直通封装）===========

  // AccountApi
  getStrangerInfo?: (userId: string, noCache?: boolean) => Promise<any>
  getVersionInfo?: () => Promise<any>

  // MediaApi
  hydrateMedia?: (message: any[]) => Promise<void>
  getImage?: (file: string) => Promise<any>
  getRecord?: (file: string, outFormat?: string) => Promise<any>

  // MessageApi（低层消息能力）
  sendPrivateMessage?: (userId: string, message: any) => Promise<any>
  sendGroupMessage?: (groupId: string, message: any) => Promise<any>
  setEssenceMessage?: (messageId: string) => Promise<any>
  deleteEssenceMessage?: (messageId: string) => Promise<any>
  getEssenceMessageList?: (groupId: string) => Promise<any>
  markMessageAsRead?: (messageId: string) => Promise<any>
  getGroupAtAllRemain?: (groupId: string) => Promise<number>
  getGroupSystemMsg?: () => Promise<any>
  // NapCat 扩展：戳一戳 / 已读 / 历史
  sendGroupPoke?: (groupId: string, userId: string) => Promise<any>
  sendFriendPoke?: (userId: string) => Promise<any>
  sendPoke?: (targetId: string, groupId?: string) => Promise<any>
  markGroupMsgAsRead?: (groupId: string) => Promise<any>
  markPrivateMsgAsRead?: (userId: string) => Promise<any>
  markAllMsgAsRead?: () => Promise<any>
  getGroupMsgHistory?: (params: { group_id: string, message_seq: number | string, count: number, reverse_order?: boolean }) => Promise<any>
  getFriendMsgHistory?: (params: { user_id: string, message_seq: number | string, count: number, reverse_order?: boolean }) => Promise<any>
  getRecentContact?: (count: number) => Promise<any>

  // GroupApi（补齐 NapLink 暴露能力）
  setGroupLeave?: (groupId: string, isDismiss?: boolean) => Promise<any>
  setGroupAnonymousBan?: (groupId: string, anonymousFlag: string, duration?: number) => Promise<any>

  // FileApi（文件/群文件系统）
  uploadGroupFile?: (groupId: string, file: string | Buffer | Uint8Array | NodeJS.ReadableStream, name: string) => Promise<any>
  uploadPrivateFile?: (userId: string, file: string | Buffer | Uint8Array | NodeJS.ReadableStream, name: string) => Promise<any>
  setGroupPortrait?: (groupId: string, file: string | Buffer | Uint8Array | NodeJS.ReadableStream) => Promise<any>
  getGroupFileSystemInfo?: (groupId: string) => Promise<any>
  getGroupRootFiles?: (groupId: string) => Promise<any>
  getGroupFilesByFolder?: (groupId: string, folderId: string) => Promise<any>
  getGroupFileUrl?: (groupId: string, fileId: string, busid?: number) => Promise<any>
  deleteGroupFile?: (groupId: string, fileId: string, busid?: number) => Promise<any>
  createGroupFileFolder?: (groupId: string, name: string, parentId?: string) => Promise<any>
  deleteGroupFolder?: (groupId: string, folderId: string) => Promise<any>
  downloadFile?: (url: string, threadCount?: number, headers?: Record<string, string>) => Promise<any>

  // StreamApi（大文件分片上传）
  uploadFileStream?: (
    file: string | Buffer | Uint8Array | NodeJS.ReadableStream,
    options?: {
      chunkSize?: number
      streamId?: string
      expectedSha256?: string
      fileRetention?: number
      filename?: string
      reset?: boolean
      verifyOnly?: boolean
    },
  ) => Promise<any>
  getUploadStreamStatus?: (streamId: string) => Promise<any>
  // StreamApi（NapCat 流式下载）
  downloadFileStreamToFile?: (fileId: string, options?: { chunkSize?: number, filename?: string }) => Promise<{ path: string, info?: any }>
  downloadFileImageStreamToFile?: (fileId: string, options?: { chunkSize?: number, filename?: string }) => Promise<{ path: string, info?: any }>
  downloadFileRecordStreamToFile?: (fileId: string, outFormat?: string, options?: { chunkSize?: number, filename?: string }) => Promise<{ path: string, info?: any }>
  cleanStreamTempFile?: () => Promise<any>

  // ============ NapCat 扩展（可选）===========
  // System
  getOnlineClients?: (noCache?: boolean) => Promise<any>
  getRobotUinRange?: () => Promise<any>
  canSendImage?: () => Promise<any>
  canSendRecord?: () => Promise<any>
  getCookies?: (domain: string) => Promise<any>
  getCsrfToken?: () => Promise<any>
  getCredentials?: (domain: string) => Promise<any>
  setInputStatus?: (userId: string, eventType: number) => Promise<any>
  ocrImage?: (image: string, dot?: boolean) => Promise<any>
  translateEn2zh?: (words: string[]) => Promise<any>
  checkUrlSafely?: (url: string) => Promise<any>
  handleQuickOperation?: (context: any, operation: any) => Promise<any>
  getModelShow?: (model: string) => Promise<any>
  setModelShow?: (model: string, modelShow: string) => Promise<any>
  getPacketStatus?: () => Promise<any>

  // Extensions
  getRkeyEx?: () => Promise<any>
  getRkeyServer?: () => Promise<any>
  getRkey?: () => Promise<any>
  setFriendRemark?: (userId: string, remark: string) => Promise<any>
  deleteFriend?: (userId: string) => Promise<any>
  getUnidirectionalFriendList?: () => Promise<any>
  setGroupRemark?: (groupId: string, remark: string) => Promise<any>
  getGroupInfoEx?: (groupId: string) => Promise<any>
  getGroupDetailInfo?: (groupId: string) => Promise<any>
  getGroupIgnoredNotifies?: () => Promise<any>
  getGroupShutList?: (groupId: string) => Promise<any>
  sendPrivateForwardMessage?: (params: any) => Promise<any>
  forwardFriendSingleMsg?: (userId: string, messageId: string) => Promise<any>
  forwardGroupSingleMsg?: (groupId: string, messageId: string) => Promise<any>
  sendForwardMsg?: (params: any) => Promise<any>
  sendGroupNotice?: (params: any) => Promise<any>
  getGroupNotice?: (groupId: string) => Promise<any>
  delGroupNotice?: (groupId: string, noticeId: string) => Promise<any>
  setOnlineStatus?: (status: number | string, extStatus: number | string, batteryStatus: number | string) => Promise<any>
  setDiyOnlineStatus?: (faceId: number | string, wording?: string, faceType?: number | string) => Promise<any>
  sendArkShare?: (params: any) => Promise<any>
  sendGroupArkShare?: (groupId: string) => Promise<any>
  getMiniAppArk?: (payload: any) => Promise<any>
  getAiCharacters?: (groupId: string, chatType?: number | string) => Promise<any>
  getAiRecord?: (groupId: string, character: string, text: string) => Promise<any>
  sendGroupAiRecord?: (groupId: string, character: string, text: string) => Promise<any>
  setGroupSign?: (groupId: string) => Promise<any>
  sendGroupSign?: (groupId: string) => Promise<any>
  getClientkey?: () => Promise<any>
  clickInlineKeyboardButton?: (params: any) => Promise<any>

  // ============ 联系人操作 ============

  /**
   * 获取好友列表
   */
  getFriendList: () => Promise<Sender[]>

  /**
   * 获取群列表
   */
  getGroupList: () => Promise<Chat[]>

  /**
   * 获取群成员列表
   * @param groupId 群号
   */
  getGroupMemberList: (groupId: string) => Promise<Sender[]>

  /**
   * 获取好友信息
   * @param uin QQ 号
   */
  getFriendInfo: (uin: string) => Promise<Sender | null>

  /**
   * 获取群信息
   * @param groupId 群号
   */
  getGroupInfo: (groupId: string) => Promise<Chat | null>

  /**
   * 获取群成员详细信息
   * @param groupId 群号
   * @param userId 成员 QQ 号
   */
  getGroupMemberInfo: (groupId: string, userId: string) => Promise<any>

  /**
   * 获取用户信息 (get_stranger_info)
   * @param userId QQ 号
   */
  getUserInfo: (userId: string) => Promise<any>

  // ============ 群组管理 ============

  /**
   * 禁言群成员
   * @param groupId 群号
   * @param userId 成员 QQ 号
   * @param duration 禁言时长（秒），0 表示解除禁言
   */
  banUser?: (groupId: string, userId: string, duration: number) => Promise<void>

  /**
   * 解除群成员禁言
   * @param groupId 群号
   * @param userId 成员 QQ 号
   */
  unbanUser?: (groupId: string, userId: string) => Promise<void>

  /**
   * 踢出群成员
   * @param groupId 群号
   * @param userId 成员 QQ 号
   * @param rejectAddRequest 是否拒绝再次加群请求
   */
  kickUser?: (groupId: string, userId: string, rejectAddRequest?: boolean) => Promise<void>

  /**
   * 设置群成员名片
   * @param groupId 群号
   * @param userId 成员 QQ 号
   * @param card 新的群名片
   */
  setGroupCard?: (groupId: string, userId: string, card: string) => Promise<void>

  /**
   * 全员禁言
   * @param groupId 群号
   * @param enable 是否开启全员禁言
   */
  setGroupWholeBan?: (groupId: string, enable: boolean) => Promise<void>

  /**
   * 设置群管理员
   * @param groupId 群号
   * @param userId 成员 QQ 号
   * @param enable 是否设置为管理员
   */
  setGroupAdmin?: (groupId: string, userId: string, enable: boolean) => Promise<void>

  /**
   * 修改群名称
   * @param groupId 群号
   * @param groupName 新群名
   */
  setGroupName?: (groupId: string, groupName: string) => Promise<void>

  /**
   * 设置群成员专属头衔
   * @param groupId 群号
   * @param userId 成员 QQ 号
   * @param title 专属头衔
   * @param duration 有效期（秒），-1表示永久
   */
  setGroupSpecialTitle?: (groupId: string, userId: string, title: string, duration?: number) => Promise<void>

  /**
   * 处理好友申请
   * @param flag 请求 flag
   * @param approve 是否同意
   * @param remark 好友备注
   */
  handleFriendRequest?: (flag: string, approve: boolean, remark?: string) => Promise<void>

  /**
   * 处理加群申请
   * @param flag 请求 flag
   * @param subType 请求类型：'add'（主动加群）| 'invite'（邀请入群）
   * @param approve 是否同意
   * @param reason 拒绝理由
   */
  handleGroupRequest?: (flag: string, subType: 'add' | 'invite', approve: boolean, reason?: string) => Promise<void>

  /**
   * 点赞
   * @param userId 用户 QQ 号
   * @param times 点赞次数（1-10，默认1）
   */
  sendLike?: (userId: string, times?: number) => Promise<void>

  /**
   * 获取群荣誉信息
   * @param groupId 群号
   * @param type 荣誉类型
   */
  getGroupHonorInfo?: (groupId: string, type?: 'talkative' | 'performer' | 'legend' | 'strong_newbie' | 'emotion' | 'all') => Promise<any>

  // ============ 事件监听 ============

  on: ((event: 'message', listener: (message: UnifiedMessage) => void) => this) & ((event: 'recall', listener: (event: RecallEvent) => void) => this) & ((event: 'friend.increase', listener: (friend: Sender) => void) => this) & ((event: 'friend.decrease', listener: (uin: string) => void) => this) & ((event: 'group.increase', listener: (groupId: string, member: Sender) => void) => this) & ((event: 'group.decrease', listener: (groupId: string, uin: string) => void) => this) & ((event: 'poke', listener: (chatId: string, operatorId: string, targetId: string) => void) => this) & ((event: 'error', listener: (error: Error) => void) => this) & ((event: 'offline', listener: () => void) => this) & ((event: 'online', listener: () => void) => this) & ((event: 'connection:lost', listener: (data: { timestamp: number, reason: string }) => void) => this) & ((event: 'connection:restored', listener: (data: { timestamp: number }) => void) => this) & ((event: 'request.friend', listener: (data: FriendRequestEvent) => void) => this) & ((event: 'request.group', listener: (data: GroupRequestEvent) => void) => this)

  // ============ 生命周期 ============

  login: () => Promise<void>
  logout: () => Promise<void>
  destroy: () => Promise<void>
}

/**
 * QQ 客户端创建参数
 */
export type QQClientCreateParams = NapCatCreateParams

export interface NapCatCreateParams {
  type: 'napcat'
  wsUrl: string
  reconnect?: boolean
  reconnectInterval?: number
}

/**
 * QQ 客户端工厂接口
 */
export interface IQQClientFactory {
  create: (params: QQClientCreateParams) => Promise<IQQClient>
}
