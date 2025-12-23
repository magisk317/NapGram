import type { IQQClient } from '../../infrastructure/clients/qq'
import type Telegram from '../../infrastructure/clients/telegram/client'
import { getLogger } from '../logger'

const logger = getLogger('NotificationService')

/**
 * 通知服务
 * 负责向管理员发送各类系统通知
 */
export class NotificationService {
  private lastNotificationTime = 0
  private readonly cooldownMs: number

  constructor(cooldownMs: number = 3600000) { // 默认1小时
    this.cooldownMs = cooldownMs
  }

  /**
   * 发送掉线通知给管理员
   */
  async notifyDisconnection(
    qqClient: IQQClient | undefined,
    tgBot: Telegram,
    adminQQ?: number,
    adminTG?: number,
  ): Promise<void> {
    // 检查冷却时间
    const now = Date.now()
    if (now - this.lastNotificationTime < this.cooldownMs) {
      logger.debug(`Notification suppressed due to cooldown (${this.cooldownMs}ms)`)
      return
    }

    const timestamp = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    })
    const message = `⚠️ NapCat 连接已断开\n时间: ${timestamp}\n\n系统将自动尝试重连...`

    let qqSent = false
    let tgSent = false

    // 发送到 QQ 管理员
    if (qqClient && adminQQ) {
      try {
        const isOnline = await qqClient.isOnline()
        if (isOnline) {
          await qqClient.sendMessage(String(adminQQ), {
            id: String(Date.now()),
            platform: 'qq',
            sender: { id: String(qqClient.uin), name: qqClient.nickname },
            chat: { id: String(adminQQ), type: 'private' },
            content: [{ type: 'text', data: { text: message } }],
            timestamp: Date.now(),
          })
          qqSent = true
          logger.info(`Disconnection notification sent to QQ admin: ${adminQQ}`)
        }
      }
      catch (error) {
        logger.warn(error, `Failed to send notification to QQ admin ${adminQQ}:`)
      }
    }

    // 发送到 TG 管理员
    if (adminTG) {
      try {
        const chat = await tgBot.getChat(adminTG)
        await chat.sendMessage(message, { disableWebPreview: true })
        tgSent = true
        logger.info(`Disconnection notification sent to TG admin: ${adminTG}`)
      }
      catch (error) {
        logger.warn(error, `Failed to send notification to TG admin ${adminTG}:`)
      }
    }

    if (qqSent || tgSent) {
      this.lastNotificationTime = now
    }
    else {
      logger.warn('No notification sent: either no admin configured or all sends failed')
    }
  }

  /**
   * 发送重连成功通知给管理员
   */
  async notifyReconnection(
    qqClient: IQQClient | undefined,
    tgBot: Telegram,
    adminQQ?: number,
    adminTG?: number,
  ): Promise<void> {
    const timestamp = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    })
    const message = `✅ NapCat 连接已恢复\n时间: ${timestamp}`

    // 发送到 QQ 管理员
    if (qqClient && adminQQ) {
      try {
        const isOnline = await qqClient.isOnline()
        if (isOnline) {
          await qqClient.sendMessage(String(adminQQ), {
            id: String(Date.now()),
            platform: 'qq',
            sender: { id: String(qqClient.uin), name: qqClient.nickname },
            chat: { id: String(adminQQ), type: 'private' },
            content: [{ type: 'text', data: { text: message } }],
            timestamp: Date.now(),
          })
          logger.info(`Reconnection notification sent to QQ admin: ${adminQQ}`)
        }
      }
      catch (error) {
        logger.warn(error, `Failed to send reconnection notification to QQ admin ${adminQQ}:`)
      }
    }

    // 发送到 TG 管理员
    if (adminTG) {
      try {
        const chat = await tgBot.getChat(adminTG)
        await chat.sendMessage(message, { disableWebPreview: true })
        logger.info(`Reconnection notification sent to TG admin: ${adminTG}`)
      }
      catch (error) {
        logger.warn(error, `Failed to send reconnection notification to TG admin ${adminTG}:`)
      }
    }

    // 重连通知不重置冷却时间，避免影响下次掉线通知
  }
}
