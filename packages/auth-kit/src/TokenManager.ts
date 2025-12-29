import { randomBytes, scryptSync } from 'node:crypto'
import process from 'node:process'
import db from '../../../main/src/domain/models/db'

/**
 * Token 管理器
 * 支持两种认证方式：
 * 1. Access Token - 独立于用户存在，用于 API 访问
 * 2. Session Token - 关联用户，用于会话管理
 */
export class TokenManager {
  /**
   * 生成随机 token
   */
  static generateToken(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * 验证 Access Token
   */
  static async verifyAccessToken(token: string): Promise<boolean> {
    const accessToken = await db.accessToken.findFirst({
      where: {
        token,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    })

    if (accessToken) {
      // 更新最后使用时间
      await db.accessToken.update({
        where: { id: accessToken.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => { })
      return true
    }

    return false
  }

  /**
   * 验证 Session Token
   */
  static async verifySessionToken(token: string): Promise<{ userId: number } | null> {
    const session = await db.adminSession.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    })

    if (session && session.user.isActive) {
      return { userId: session.user.id }
    }

    return null
  }

  /**
   * 创建 Access Token
   */
  static async createAccessToken(
    description?: string,
    createdBy?: number,
    expiresAt?: Date,
  ): Promise<string> {
    const token = this.generateToken()

    await db.accessToken.create({
      data: {
        token,
        description,
        createdBy,
        expiresAt,
        isActive: true,
      },
    })

    return token
  }

  /**
   * 创建 Session Token（用户登录后）
   */
  static async createSessionToken(
    userId: number,
    ipAddress?: string,
    userAgent?: string,
    expiresIn: number = 7 * 24 * 60 * 60 * 1000, // 7 days
  ): Promise<string> {
    const token = this.generateToken()
    const expiresAt = new Date(Date.now() + expiresIn)

    await db.adminSession.create({
      data: {
        token,
        userId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    })

    return token
  }

  /**
   * 撤销 Access Token
   */
  static async revokeAccessToken(token: string): Promise<boolean> {
    const result = await db.accessToken.updateMany({
      where: { token },
      data: { isActive: false },
    })

    return result.count > 0
  }

  /**
   * 撤销 Session Token（登出）
   */
  static async revokeSessionToken(token: string): Promise<boolean> {
    const result = await db.adminSession.deleteMany({
      where: { token },
    })

    return result.count > 0
  }

  /**
   * 清理过期的 tokens
   */
  static async cleanupExpiredTokens(): Promise<void> {
    await db.adminSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    })
  }

  /**
   * 从环境变量获取初始 Admin Token
   */
  static getEnvAdminToken(): string | undefined {
    return process.env.ADMIN_TOKEN
  }

  /**
   * 验证 token（统一入口，支持 Access Token、Session Token、Env Token）
   */
  static async verifyToken(token: string): Promise<{ type: 'access' | 'session' | 'env', userId?: number } | null> {
    // 1. 检查环境变量 token
    const envToken = this.getEnvAdminToken()
    if (envToken && token === envToken) {
      return { type: 'env' }
    }

    // 2. 检查 Access Token
    if (await this.verifyAccessToken(token)) {
      return { type: 'access' }
    }

    // 3. 检查 Session Token
    const sessionData = await this.verifySessionToken(token)
    if (sessionData) {
      return { type: 'session', userId: sessionData.userId }
    }

    return null
  }
}

/**
 * 密码工具
 */
export class PasswordUtil {
  /**
   * Hash 密码
   */
  static hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
  }

  /**
   * 验证密码
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':')
    const hashToCompare = scryptSync(password, salt, 64).toString('hex')
    return hash === hashToCompare
  }
}
