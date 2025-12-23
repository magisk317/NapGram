import type Instance from '../../domain/models/Instance'
import type { FriendRequestEvent, GroupRequestEvent, IQQClient } from '../../infrastructure/clients/qq'
import type Telegram from '../../infrastructure/clients/telegram/client'
import db from '../../domain/models/db'
import { getLogger } from '../../shared/logger'

const logger = getLogger('RequestHandlerFeature')

/**
 * 请求处理功能
 * Phase 3: 监听好友/加群申请，存储到数据库，发送Telegram通知
 */
export class RequestHandlerFeature {
  constructor(
    private readonly instance: Instance,
    private readonly qqClient: IQQClient,
    private readonly tgBot: Telegram,
  ) {
    this.setupListeners()
    logger.info('RequestHandlerFeature ✓ 初始化完成')
  }

  /**
   * 设置事件监听器
   */
  private setupListeners() {
    this.qqClient.on('request.friend', this.handleFriendRequest)
    this.qqClient.on('request.group', this.handleGroupRequest)
    logger.info('RequestHandlerFeature listening QQ request events')
  }

  /**
   * 处理好友申请
   */
  private handleFriendRequest = async (data: FriendRequestEvent) => {
    try {
      logger.info(`Received friend request: ${data.userId} (${data.flag})`)

      // 1. 存储到数据库
      const request = await db.qQRequest.create({
        data: {
          instanceId: this.instance.id,
          flag: data.flag,
          type: 'friend',
          userId: BigInt(data.userId),
          comment: data.comment,
          status: 'pending',
        },
      })

      logger.info(`Stored friend request to database: ${request.id}`)

      // 2. 发送Telegram通知
      await this.sendTelegramNotification(request, 'friend')
    }
    catch (error) {
      logger.error('Failed to handle friend request:', error)
    }
  }

  /**
   * 处理加群申请
   */
  private handleGroupRequest = async (data: GroupRequestEvent) => {
    try {
      logger.info(`Received group request: user=${data.userId}, group=${data.groupId}, type=${data.subType} (${data.flag})`)

      // 1. 存储到数据库
      const request = await db.qQRequest.create({
        data: {
          instanceId: this.instance.id,
          flag: data.flag,
          type: 'group',
          subType: data.subType,
          userId: BigInt(data.userId),
          groupId: BigInt(data.groupId),
          comment: data.comment,
          status: 'pending',
        },
      })

      logger.info(`Stored group request to database: ${request.id}`)

      // 2. 发送Telegram通知
      await this.sendTelegramNotification(request, 'group')
    }
    catch (error) {
      logger.error('Failed to handle group request:', error)
    }
  }

  /**
   * 发送Telegram通知
   */
  private async sendTelegramNotification(request: any, type: 'friend' | 'group') {
    try {
      const ownerTgId = this.instance.owner
      if (!ownerTgId) {
        logger.warn('Instance owner not set, cannot send notification')
        return
      }

      const message = type === 'friend'
        ? this.formatFriendRequestNotification(request)
        : this.formatGroupRequestNotification(request)

      // 发送通知到实例owner
      const chat = await this.tgBot.getChat(Number(ownerTgId))
      await chat.sendMessage(message, {
        disableWebPreview: true,
      })

      logger.info(`Sent Telegram notification to ${ownerTgId} for ${type} request ${request.flag}`)
    }
    catch (error) {
      logger.error(`Failed to send Telegram notification for ${type} request:`, error)
    }
  }

  /**
   * 格式化好友申请通知
   */
  private formatFriendRequestNotification(request: any): string {
    const time = new Date(request.createdAt).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
    })

    return `📬 好友申请
━━━━━━━━━━━━━━━━
👤 用户：${request.userId}
💬 验证消息：${request.comment || '(无)'}
⏰ 时间：${time}

使用以下命令操作：
/approve ${request.flag} - 同意
/reject ${request.flag} - 拒绝`
  }

  /**
   * 格式化加群申请通知
   */
  private formatGroupRequestNotification(request: any): string {
    const time = new Date(request.createdAt).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
    })
    const typeText = request.subType === 'add' ? '主动加群' : '邀请入群'

    return `📬 加群申请
━━━━━━━━━━━━━━━━
👤 用户：${request.userId}
🏠 群号：${request.groupId}
📋 类型：${typeText}
💬 验证消息：${request.comment || '(无)'}
⏰ 时间：${time}

使用以下命令操作：
/approve ${request.flag} - 同意
/reject ${request.flag} - 拒绝`
  }

  /**
   * 清理资源
   */
  destroy() {
    this.qqClient.off('request.friend', this.handleFriendRequest)
    this.qqClient.off('request.group', this.handleGroupRequest)
    logger.info('RequestHandlerFeature destroyed')
  }
}
