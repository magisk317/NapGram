import type { Instance } from '../../../shared-types'
import { env } from '@napgram/infra-kit'

/**
 * 权限检查服务
 * 负责验证用户是否有权限执行管理员命令
 */
export class PermissionService {
  constructor(private readonly instance: Instance) { }

  /**
   * 检查用户是否是管理员
   * @param userId 用户 ID
   * @returns 是否是管理员
   */
  isAdmin(userId: string): boolean {
    const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null
    const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null
    return userId === String(this.instance.owner)
      || (envAdminQQ !== null && userId === envAdminQQ)
      || (envAdminTG !== null && userId === envAdminTG)
  }
}
