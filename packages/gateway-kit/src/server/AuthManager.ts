/**
 * Gateway 认证管理器
 * 使用 Bearer Token 认证
 */

import process from 'node:process'
import { getLogger } from '../logger'

const logger = getLogger('AuthManager')

export interface AuthResult {
  success: boolean
  userId?: string
  userName?: string
  instances?: number[]
  error?: string
}

export class AuthManager {
  /**
   * 验证 Token
   * MVP: 简单的 Bearer Token 验证（使用 ADMIN_TOKEN）
   * Phase 2: 可扩展为数据库 Access Token
   */
  async authenticate(token: string): Promise<AuthResult> {
    try {
      // MVP: 使用 ADMIN_TOKEN 作为 Gateway Token
      const adminToken = process.env.ADMIN_TOKEN

      if (!adminToken) {
        logger.warn('ADMIN_TOKEN not configured, Gateway authentication disabled')
        return {
          success: true,
          userId: 'guest',
          userName: 'Guest User',
          instances: [0], // 默认实例（最小权限）
        }
      }

      if (token === adminToken) {
        logger.info('Gateway authenticated with ADMIN_TOKEN')
        return {
          success: true,
          userId: 'admin',
          userName: 'Administrator',
          instances: [0], // Phase 2: 从数据库/配置加载可访问实例列表
        }
      }

      logger.warn('Invalid Gateway token')
      return {
        success: false,
        error: 'Invalid token',
      }
    }
    catch (error: any) {
      logger.error('Authentication error', error)
      return {
        success: false,
        error: error.message || 'Authentication failed',
      }
    }
  }

  /**
   * Phase 2: 支持数据库 Access Token
   */
  // async authenticateWithAccessToken(token: string): Promise<AuthResult> {
  //     const accessToken = await db.accessToken.findFirst({
  //         where: { token, isActive: true }
  //     });
  //     ...
  // }
}
