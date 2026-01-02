import type { Instance } from '../../../shared-types'
import { env } from '@napgram/infra-kit'

/**
 * 权限检查服务
 */
export class PermissionChecker {
  constructor(private readonly instance: Instance) { }

  /**
   * 检查是否是管理员
   */
  isAdmin(userId: string): boolean {
    const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null
    const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null
    return userId === String(this.instance.owner)
      || (envAdminQQ !== null && userId === envAdminQQ)
      || (envAdminTG !== null && userId === envAdminTG)
  }
}
