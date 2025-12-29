/**
 * NapGram 事件发布器
 *
 * 将 NapGram Core 的事件转换为插件系统的标准事件
 */

import type { EventBus } from '../core/event-bus'
import type { FriendRequestEvent, GroupRequestEvent, MessageEvent, NoticeEvent, NoticeType } from '../core/interfaces'
import { getLogger } from '../../shared/logger'
import { getGlobalRuntime } from '../core/plugin-runtime'

const logger = getLogger('EventPublisher')

/**
 * 事件发布器
 */
export class EventPublisher {
  constructor(private readonly eventBus: EventBus) { }

  /**
   * 发布消息事件
   *
   * @param params 消息参数
   * @param params.instanceId 实例 ID
   * @param params.platform 平台
   * @param params.channelId 频道 ID
   * @param params.channelType 频道类型
   * @param params.threadId 线程 ID（可选）
   * @param params.sender 发送者信息
   * @param params.sender.userId 发送者 ID
   * @param params.sender.userName 发送者用户名
   * @param params.sender.userNick 发送者昵称
   * @param params.sender.isAdmin 是否管理员
   * @param params.sender.isOwner 是否群主
   * @param params.message 消息内容
   * @param params.message.id 消息 ID
   * @param params.message.text 消息文本
   * @param params.message.segments 消息分段
   * @param params.message.timestamp 时间戳
   * @param params.message.quote 引用消息（可选）
   * @param params.message.quote.id 引用消息 ID
   * @param params.message.quote.userId 引用消息发送者 ID
   * @param params.message.quote.text 引用消息文本
   * @param params.raw 原始事件数据
   * @param params.reply 回复函数
   * @param params.send 发送函数
   * @param params.recall 撤回函数
   */
  publishMessage(params: {
    instanceId: number
    platform: 'qq' | 'tg'
    channelId: string
    channelType: 'group' | 'private' | 'channel'
    threadId?: number
    sender: {
      userId: string
      userName: string
      userNick?: string
      isAdmin?: boolean
      isOwner?: boolean
    }
    message: {
      id: string
      text: string
      segments: any[]
      timestamp: number
      quote?: {
        id: string
        userId: string
        text: string
      }
    }
    raw: any
    reply: (content: string | any[]) => Promise<any>
    send: (content: string | any[]) => Promise<any>
    recall: () => Promise<void>
  }): void {
    const channelRef
      = params.platform === 'qq'
        ? `qq:${params.channelType === 'private' ? 'private' : 'group'}:${params.channelId}`
        : `tg:${params.channelId}`

    const messageRef
      = params.platform === 'qq'
        ? `qq:${params.message.id}`
        : `tg:${params.channelId}:${params.message.id}`

    const event: MessageEvent = {
      eventId: `msg-${params.instanceId}-${params.message.id}-${Date.now()}`,
      instanceId: params.instanceId,
      platform: params.platform,
      channelId: params.channelId,
      channelRef,
      channelType: params.channelType,
      threadId: params.threadId,
      sender: params.sender,
      message: {
        id: params.message.id,
        ref: messageRef,
        text: params.message.text,
        segments: params.message.segments,
        timestamp: params.message.timestamp,
        quote: params.message.quote,
      },
      raw: params.raw,
      reply: params.reply,
      send: params.send,
      recall: params.recall,
    }

    logger.debug({
      instanceId: params.instanceId,
      platform: params.platform,
      channelId: params.channelId,
      messageId: params.message.id,
    }, 'Publishing message event')

    this.eventBus.publishSync('message', event)
  }

  /**
   * 发布好友请求事件（Phase 4 后期实现）
   */
  publishFriendRequest(params: {
    instanceId: number
    platform: 'qq' | 'tg'
    requestId: string
    userId: string
    userName: string
    comment?: string
    timestamp: number
    approve: () => Promise<void>
    reject: (reason?: string) => Promise<void>
  }): void {
    const event: FriendRequestEvent = {
      eventId: `friend-request-${params.instanceId}-${params.requestId}-${Date.now()}`,
      instanceId: params.instanceId,
      platform: params.platform,
      requestId: params.requestId,
      userId: params.userId,
      userName: params.userName,
      comment: params.comment,
      timestamp: params.timestamp,
      approve: params.approve,
      reject: params.reject,
    }

    this.eventBus.publishSync('friend-request', event)
  }

  /**
   * 发布群组请求事件（Phase 4 后期实现）
   */
  publishGroupRequest(params: {
    instanceId: number
    platform: 'qq' | 'tg'
    requestId: string
    groupId: string
    userId: string
    userName: string
    comment?: string
    subType?: 'add' | 'invite'
    timestamp: number
    approve: () => Promise<void>
    reject: (reason?: string) => Promise<void>
  }): void {
    const event: GroupRequestEvent = {
      eventId: `group-request-${params.instanceId}-${params.requestId}-${Date.now()}`,
      instanceId: params.instanceId,
      platform: params.platform,
      requestId: params.requestId,
      groupId: params.groupId,
      userId: params.userId,
      userName: params.userName,
      comment: params.comment,
      subType: params.subType,
      timestamp: params.timestamp,
      approve: params.approve,
      reject: params.reject,
    }

    this.eventBus.publishSync('group-request', event)
  }

  /**
   * 发布通知事件（Phase 4 后期实现）
   */
  publishNotice(params: {
    instanceId: number
    platform: 'qq' | 'tg'
    noticeType: NoticeType
    groupId?: string
    userId?: string
    operatorId?: string
    duration?: number
    timestamp: number
    raw: any
  }): void {
    const event: NoticeEvent = {
      eventId: `notice-${params.instanceId}-${params.noticeType}-${Date.now()}`,
      instanceId: params.instanceId,
      platform: params.platform,
      noticeType: params.noticeType,
      groupId: params.groupId,
      userId: params.userId,
      operatorId: params.operatorId,
      duration: params.duration,
      timestamp: params.timestamp,
      raw: params.raw,
    }

    this.eventBus.publishSync('notice', event)
  }

  /**
   * 发布实例状态变化事件
   */
  publishInstanceStatus(params: {
    instanceId: number
    status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
    error?: Error
  }): void {
    this.eventBus.publishSync('instance-status', {
      instanceId: params.instanceId,
      status: params.status,
      error: params.error,
      timestamp: Date.now(),
    })
  }
}

/**
 * 获取全局事件发布器实例
 */
export function getEventPublisher(): EventPublisher {
  const runtime = getGlobalRuntime()
  const eventBus = runtime.getEventBus()
  return new EventPublisher(eventBus)
}
