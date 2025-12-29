import type { Buffer } from 'node:buffer'

export type Gender = 'male' | 'female' | 'unknown'
export type GroupRole = 'owner' | 'admin' | 'member'

export interface TextElem { type: 'text', text: string }
export interface FaceElem { type: 'face', id: number, text?: string }
export interface ImageElem { type: 'image', file: string, url?: string, asface?: boolean }
export interface AtElem { type: 'at', qq: number | 'all', text?: string }
export interface PttElem { type: 'record', file: string, url?: string }
export interface VideoElem { type: 'video', file: string, url?: string }
export interface MfaceElem { type: 'mface', url: string, emoji_package_id: number, emoji_id: string, key: string, text: string }
export interface ForwardNode { type: 'node', user_id: number, nickname: string, content: MessageElem[], message?: MessageElem[] }
export interface RpsElem { type: 'rps', id: number }
export interface DiceElem { type: 'dice', id: number }
export interface Quotable { user_id: number, time: number, seq: number, rand: number, message: MessageElem[] }
export interface MessageRet { message_id: string, seq: number, rand: number, time: number }

export type FaceElemEx = FaceElem & {
  resultId?: string
  chainCount?: number
}

export type ImageElemEx = ImageElem & {
  brief?: string
}

export type MessageElem = TextElem | FaceElem | ImageElem | AtElem | PttElem | VideoElem | MfaceElem | ForwardNode | RpsElem | DiceElem | FaceElemEx | ImageElemEx | any

export type SendableElem = TextElem | FaceElem | ImageElem | AtElem | PttElem | VideoElem | MfaceElem | ForwardNode | RpsElem | DiceElem | FaceElemEx | ImageElemEx

export type Sendable = SendableElem | string | (SendableElem | string)[]

export interface QQEntity {
  readonly client: { uin: number }
  readonly dm: boolean

  getForwardMsg: (resid: string, fileName?: string) => Promise<ForwardMessage[]>

  getVideoUrl: (fid: string, md5: string | Buffer) => Promise<string>

  recallMsg: (seqOrMessageId: number, rand?: number, timeOrPktNum?: number) => Promise<boolean>

  sendMsg: (content: Sendable, source?: Quotable, isSpoiler?: boolean) => Promise<MessageRet>

  getFileUrl: (fid: string) => Promise<string>
}

export interface QQUser extends QQEntity {
  readonly uin: number
}

export interface Friend extends QQUser {
  readonly nickname: string
  readonly remark: string

  sendFile: (file: string, filename: string) => Promise<string>
}

export interface Group extends QQEntity {
  readonly gid: number
  readonly name: string
  readonly is_owner: boolean
  readonly is_admin: boolean
  readonly fs: GroupFs

  pickMember: (uin: number, strict?: boolean) => GroupMember

  muteMember: (uin: number, duration?: number) => Promise<void>

  setCard: (uin: number, card?: string) => Promise<boolean>

  announce: (content: string) => Promise<any>
}

export interface GroupFs {
  upload: (file: string | Buffer | Uint8Array, pid?: string, name?: string, callback?: (percentage: string) => void) => Promise<any>
}

export interface GroupMember extends QQUser {
  renew: () => Promise<GroupMemberInfo>
}

export interface GroupMemberInfo {
  readonly user_id: number
  readonly card: string
  readonly nickname: string
  readonly sex: Gender
  readonly age: number
  readonly join_time: number
  readonly last_sent_time: number
  readonly role: GroupRole
  readonly title: string
}

export interface ForwardMessage {
  user_id: number
  nickname: string
  group_id?: number
  time: number
  seq: number
  message: MessageElem[]
  raw_message: string
}
