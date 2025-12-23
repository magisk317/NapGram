import type { Friend, Group } from '../../infrastructure/clients/qq'
import { Buffer } from 'node:buffer'

export function getAvatarUrl(room: number | bigint | Friend | Group): string {
  if (!room)
    return ''
  if (typeof room === 'object' && 'uin' in room) {
    room = room.uin
  }
  if (typeof room === 'object' && 'gid' in room) {
    room = -room.gid
  }
  return room < 0
    ? `https://p.qlogo.cn/gh/${-room}/${-room}/0`
    : `https://q1.qlogo.cn/g?b=qq&nk=${room}&s=0`
}

export function getImageUrlByMd5(md5: string) {
  return `https://gchat.qpic.cn/gchatpic_new/0/0-0-${md5.toUpperCase()}/0`
}

export function getBigFaceUrl(file: string) {
  return `https://gxh.vip.qq.com/club/item/parcel/item/${file.substring(0, 2)}/${file.substring(0, 32)}/300x300.png`
}

export async function fetchFile(url: string): Promise<Buffer> {
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export function getAvatar(room: number | Friend | Group) {
  return fetchFile(getAvatarUrl(room))
}

export function isContainsUrl(msg: string): boolean {
  return msg.includes('https://') || msg.includes('http://')
}

export const SUPPORTED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']

const QQ_ID_REG = /^[1-9]\d{4,10}$/
const ROOM_ID_REG = /^-?[1-9]\d{4,10}$/
const URL_REG = /https?:\/\/[-\w@%.+~#=]{1,256}\.[a-zA-Z]{2,6}\b[-\w@:%+.~#?&/=]*/

export function isValidQQ(str: string): boolean {
  return QQ_ID_REG.test(str)
}

export function isValidRoomId(str: string): boolean {
  return ROOM_ID_REG.test(str)
}

export function isValidUrl(str: string): boolean {
  return URL_REG.test(str)
}

export function hasSupportedImageExt(name: string): boolean {
  const lower = name.toLowerCase()
  return SUPPORTED_IMAGE_EXTS.some(ext => lower.endsWith(ext))
}
