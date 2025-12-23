import type { IQQClient } from '../../infrastructure/clients/qq/interface'

/**
 * 权限检查工具类
 */
export class PermissionChecker {
  /**
   * 检查用户是否为群管理员或群主
   * @param qqClient QQ客户端
   * @param groupId 群号
   * @param userId 用户QQ号
   * @returns 是否为管理员或群主
   */
  static async isGroupAdmin(
    qqClient: IQQClient,
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const memberInfo = await qqClient.getGroupMemberInfo(groupId, userId)
      if (!memberInfo)
        return false

      const role = memberInfo.role
      return role === 'admin' || role === 'owner'
    }
    catch {
      return false
    }
  }

  /**
   * 检查用户是否为群主
   * @param qqClient QQ客户端
   * @param groupId 群号
   * @param userId 用户QQ号
   * @returns 是否为群主
   */
  static async isGroupOwner(
    qqClient: IQQClient,
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const memberInfo = await qqClient.getGroupMemberInfo(groupId, userId)
      if (!memberInfo)
        return false

      return memberInfo.role === 'owner'
    }
    catch {
      return false
    }
  }

  /**
   * 检查操作者是否有权限操作目标用户
   * @param qqClient QQ客户端
   * @param groupId 群号
   * @param operatorId 操作者QQ号
   * @param targetId 目标用户QQ号
   * @returns 是否有权限
   */
  static async canManageUser(
    qqClient: IQQClient,
    groupId: string,
    operatorId: string,
    targetId: string,
  ): Promise<{ canManage: boolean, reason?: string }> {
    const operatorInfo = await qqClient.getGroupMemberInfo(groupId, operatorId)
    const targetInfo = await qqClient.getGroupMemberInfo(groupId, targetId)

    if (!operatorInfo) {
      return { canManage: false, reason: '无法获取操作者信息' }
    }

    if (!targetInfo) {
      return { canManage: false, reason: '目标用户不在群内' }
    }

    const operatorRole = operatorInfo.role
    const targetRole = targetInfo.role

    // 群主可以操作所有人
    if (operatorRole === 'owner') {
      return { canManage: true }
    }

    // 管理员可以操作普通成员
    if (operatorRole === 'admin' && targetRole === 'member') {
      return { canManage: true }
    }

    // 普通成员无权操作他人
    if (operatorRole === 'member') {
      return { canManage: false, reason: '权限不足：需要管理员或群主权限' }
    }

    // 管理员不能操作群主和其他管理员
    return { canManage: false, reason: '权限不足：无法管理群主或其他管理员' }
  }
}
