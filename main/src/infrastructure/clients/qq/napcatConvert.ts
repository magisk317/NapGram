import type { ForwardMessage } from './types'
import type { Receive, WSSendReturn } from './types/onebot-types'
import { getLogger } from '../../../shared/logger'

const logger = getLogger('NapCatConvert')

/**
 * 将 NapCat 的合并转发消息转换为统一格式
 */
export function napCatForwardMultiple(messages: WSSendReturn['get_forward_msg']['messages']): ForwardMessage[] {
  return messages.map((it) => {
    const anyIt = it as any
    // NapCat API uses 'message' field, not 'content'
    // Filter out null/undefined elements before mapping
    const contentArray = Array.isArray(anyIt.message) ? anyIt.message : [anyIt.message]
    const validContent = contentArray.filter((elem: any) => elem != null)

    return {
      group_id: it.message_type === 'group' ? it.group_id : undefined,
      nickname: it.sender.card || it.sender.nickname,
      time: it.time,
      user_id: it.sender.user_id,
      seq: it.message_id,
      raw_message: it.raw_message,
      // Also filter out null results from conversion
      message: validContent.map(napCatReceiveToMessageElem).filter((elem: any) => elem != null),
    }
  })
}

/**
 * 将 NapCat 接收的消息元素转换为统一格式
 */
function napCatReceiveToMessageElem(data: Receive[keyof Receive]): any {
  // Handle null/undefined data
  if (!data)
    return null

  const anyData = data as any
  const type = anyData.type as string

  // Debug logging to see what we're receiving
  if (!type) {
    logger.warn('[napCatConvert] Element missing type:', JSON.stringify(anyData).substring(0, 200))
    return null
  }

  switch (type) {
    case 'text':
      return {
        ...(anyData.data || {}),
        type,
      }
    case 'face':
      return {
        ...(anyData.data || {}),
        type,
        asface: 'sub_type' in anyData.data && Number.parseInt(String(anyData.data.sub_type)) > 0,
      }
    case 'sface':
    case 'image':
    case 'record':
    case 'json':
    case 'markdown':
      return {
        ...(anyData.data || {}),
        type,
        asface: 'sub_type' in anyData.data && Number.parseInt(String(anyData.data.sub_type)) > 0,
      }
    case 'mface':
      return {
        type: 'image',
        url: anyData.data.url,
        file: anyData.data.url,
      }
    case 'at':
      return {
        type,
        qq: anyData.data.qq === 'all' ? -1 : Number.parseInt(String(anyData.data.qq)),
        text: anyData.data.qq === 'all' ? '@全体成员' : `@${anyData.data.qq}`,
      }
    case 'bface':
      return {
        type: 'image',
        file: anyData.data?.url || anyData.data?.file,
        url: anyData.data?.url || anyData.data?.file,
        brief: anyData.data?.text,
      }
    case 'reply':
      return {
        type,
        id: anyData.data.id,
      }
    case 'video':
      return {
        type,
        file: anyData.data.file || anyData.data.url,
        url: anyData.data.url,
        name: anyData.data.url || anyData.data.file,
      }
    case 'file':
      return {
        type,
        file: anyData.data.file,
        file_id: anyData.data.file_id || anyData.data.file,
        url: anyData.data.file || anyData.data.url,
        file_size: anyData.data.file_size,
      }
    case 'forward':
      return {
        type,
        file: anyData.data.file || anyData.data.url,
        url: anyData.data.url || anyData.data.file,
      }
    case 'dice':
    case 'rps':
      return {
        type,
        result: Number(anyData.data.result),
      }
    case 'poke':
      return {
        type,
        id: Number(anyData.data.id),
      }
    default:
      logger.warn(`[napCatConvert] Unknown message type: ${type}, data:`, JSON.stringify(anyData).substring(0, 300))
      // Return data with type preserved for unknown types
      return {
        type,
        ...(anyData.data || anyData),
      }
  }
}
