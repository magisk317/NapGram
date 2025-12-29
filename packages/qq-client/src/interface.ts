import type { Buffer } from 'node:buffer'
import type { EventEmitter } from 'node:events'
import type {
  Chat,
  MessageReceipt,
  RecallEvent,
  Sender,
  UnifiedMessage,
} from './message'
import type { ForwardMessage } from './types/index'


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

export interface IQQClient extends EventEmitter {

  readonly uin: number

  readonly nickname: string

  readonly clientType: 'napcat'

  isOnline: () => Promise<boolean>


  sendMessage: (chatId: string, message: UnifiedMessage) => Promise<MessageReceipt>

  sendGroupForwardMsg: (groupId: string, messages: any[]) => Promise<MessageReceipt>

  recallMessage: (messageId: string) => Promise<void>

  getMessage: (messageId: string) => Promise<UnifiedMessage | null>

  getForwardMsg: (messageId: string, fileName?: string) => Promise<ForwardMessage[]>

  getFile?: (fileId: string) => Promise<any>

  callApi?: (method: string, params?: any) => Promise<any>


  getStrangerInfo?: (userId: string, noCache?: boolean) => Promise<any>
  getVersionInfo?: () => Promise<any>

  hydrateMedia?: (message: any[]) => Promise<void>
  getImage?: (file: string) => Promise<any>
  getRecord?: (file: string, outFormat?: string) => Promise<any>

  sendPrivateMessage?: (userId: string, message: any) => Promise<any>
  sendGroupMessage?: (groupId: string, message: any) => Promise<any>
  setEssenceMessage?: (messageId: string) => Promise<any>
  deleteEssenceMessage?: (messageId: string) => Promise<any>
  getEssenceMessageList?: (groupId: string) => Promise<any>
  markMessageAsRead?: (messageId: string) => Promise<any>
  getGroupAtAllRemain?: (groupId: string) => Promise<number>
  getGroupSystemMsg?: () => Promise<any>
  sendGroupPoke?: (groupId: string, userId: string) => Promise<any>
  sendFriendPoke?: (userId: string) => Promise<any>
  sendPoke?: (targetId: string, groupId?: string) => Promise<any>
  markGroupMsgAsRead?: (groupId: string) => Promise<any>
  markPrivateMsgAsRead?: (userId: string) => Promise<any>
  markAllMsgAsRead?: () => Promise<any>
  getGroupMsgHistory?: (params: { group_id: string, message_seq: number | string, count: number, reverse_order?: boolean }) => Promise<any>
  getFriendMsgHistory?: (params: { user_id: string, message_seq: number | string, count: number, reverse_order?: boolean }) => Promise<any>
  getRecentContact?: (count: number) => Promise<any>

  setGroupLeave?: (groupId: string, isDismiss?: boolean) => Promise<any>
  setGroupAnonymousBan?: (groupId: string, anonymousFlag: string, duration?: number) => Promise<any>

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
  downloadFileStreamToFile?: (fileId: string, options?: { chunkSize?: number, filename?: string }) => Promise<{ path: string, info?: any }>
  downloadFileImageStreamToFile?: (fileId: string, options?: { chunkSize?: number, filename?: string }) => Promise<{ path: string, info?: any }>
  downloadFileRecordStreamToFile?: (fileId: string, outFormat?: string, options?: { chunkSize?: number, filename?: string }) => Promise<{ path: string, info?: any }>
  cleanStreamTempFile?: () => Promise<any>

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


  getFriendList: () => Promise<Sender[]>

  getGroupList: () => Promise<Chat[]>

  getGroupMemberList: (groupId: string) => Promise<Sender[]>

  getFriendInfo: (uin: string) => Promise<Sender | null>

  getGroupInfo: (groupId: string) => Promise<Chat | null>

  getGroupMemberInfo: (groupId: string, userId: string) => Promise<any>

  getUserInfo: (userId: string) => Promise<any>


  banUser?: (groupId: string, userId: string, duration: number) => Promise<void>

  unbanUser?: (groupId: string, userId: string) => Promise<void>

  kickUser?: (groupId: string, userId: string, rejectAddRequest?: boolean) => Promise<void>

  setGroupCard?: (groupId: string, userId: string, card: string) => Promise<void>

  setGroupWholeBan?: (groupId: string, enable: boolean) => Promise<void>

  setGroupAdmin?: (groupId: string, userId: string, enable: boolean) => Promise<void>

  setGroupName?: (groupId: string, groupName: string) => Promise<void>

  setGroupSpecialTitle?: (groupId: string, userId: string, title: string, duration?: number) => Promise<void>

  handleFriendRequest?: (flag: string, approve: boolean, remark?: string) => Promise<void>

  handleGroupRequest?: (flag: string, subType: 'add' | 'invite', approve: boolean, reason?: string) => Promise<void>

  sendLike?: (userId: string, times?: number) => Promise<void>

  getGroupHonorInfo?: (groupId: string, type?: 'talkative' | 'performer' | 'legend' | 'strong_newbie' | 'emotion' | 'all') => Promise<any>


  on: ((event: 'message', listener: (message: UnifiedMessage) => void) => this)
    & ((event: 'recall', listener: (event: RecallEvent) => void) => this)
    & ((event: 'friend.increase', listener: (friend: Sender) => void) => this)
    & ((event: 'friend.decrease', listener: (uin: string) => void) => this)
    & ((event: 'group.increase', listener: (groupId: string, member: Sender) => void) => this)
    & ((event: 'group.decrease', listener: (groupId: string, uin: string) => void) => this)
    & ((event: 'poke', listener: (chatId: string, operatorId: string, targetId: string) => void) => this)
    & ((event: 'error', listener: (error: Error) => void) => this)
    & ((event: 'offline', listener: () => void) => this)
    & ((event: 'online', listener: () => void) => this)
    & ((event: 'connection:lost', listener: (data: { timestamp: number, reason: string }) => void) => this)
    & ((event: 'connection:restored', listener: (data: { timestamp: number }) => void) => this)
    & ((event: 'request.friend', listener: (data: FriendRequestEvent) => void) => this)
    & ((event: 'request.group', listener: (data: GroupRequestEvent) => void) => this)


  login: () => Promise<void>
  logout: () => Promise<void>
  destroy: () => Promise<void>
}

export interface BaseQQClientCreateParams {
  type: string
}

export type QQClientCreateParams = NapCatCreateParams | BaseQQClientCreateParams

export interface NapCatCreateParams {
  type: 'napcat'
  wsUrl: string
  reconnect?: boolean
  reconnectInterval?: number
}

export interface IQQClientFactory {
  create: (params: QQClientCreateParams) => Promise<IQQClient>
  register: (type: string, creator: (params: QQClientCreateParams) => Promise<IQQClient>) => void
}
