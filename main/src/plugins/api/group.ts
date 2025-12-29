/**
 * NapGram 群组 API 实现
 *
 * 提供插件操作群组的能力
 */

import type {
  GetGroupParams,
  GroupAPI,
  GroupInfo,
  GroupMember,
  KickUserParams,
  MuteUserParams,
  SetAdminParams,
} from '../core/interfaces'
import { getLogger } from '../../shared/logger'

const logger = getLogger('GroupAPI')

/**
 * 群组 API 实现
 */
export class GroupAPIImpl implements GroupAPI {
  /**
   * 实例访问器（Phase 4 注入）
   */
  private instanceResolver?: (instanceId: number) => any

  constructor(instanceResolver?: (instanceId: number) => any) {
    this.instanceResolver = instanceResolver
  }

  /**
   * 获取群组信息
   */
  async getInfo(params: GetGroupParams): Promise<GroupInfo | null> {
    logger.debug({ params }, 'Getting group info')

    try {
      // 获取实例
      if (!this.instanceResolver) {
        throw new Error('Instance resolver not configured (Phase 4)')
      }

      const instance = this.instanceResolver(params.instanceId)
      if (!instance) {
        throw new Error(`Instance ${params.instanceId} not found`)
      }

      // 解析群组 ID
      const { platform, id } = this.parseGroupId(params.groupId)

      // 根据平台获取群组信息
      let groupInfo: GroupInfo | null = null

      if (platform === 'qq') {
        groupInfo = await this.getQQGroupInfo(instance, id)
      }
      else if (platform === 'tg') {
        groupInfo = await this.getTGGroupInfo(instance, id)
      }
      else {
        throw new Error(`Unknown platform: ${platform}`)
      }

      if (groupInfo) {
        logger.debug({ params, groupInfo }, 'Group info retrieved')
      }

      return groupInfo
    }
    catch (error) {
      logger.error({ error, params }, 'Failed to get group info')
      throw error
    }
  }

  /**
   * 获取群成员列表
   */
  async getMembers(params: GetGroupParams): Promise<GroupMember[]> {
    logger.debug({ params }, 'Getting group members')

    try {
      // 获取实例
      if (!this.instanceResolver) {
        throw new Error('Instance resolver not configured (Phase 4)')
      }

      const instance = this.instanceResolver(params.instanceId)
      if (!instance) {
        throw new Error(`Instance ${params.instanceId} not found`)
      }

      // 解析群组 ID
      const { platform, id } = this.parseGroupId(params.groupId)

      // 根据平台获取成员列表
      let members: GroupMember[] = []

      if (platform === 'qq') {
        members = await this.getQQGroupMembers(instance, id)
      }
      else if (platform === 'tg') {
        members = await this.getTGGroupMembers(instance, id)
      }
      else {
        throw new Error(`Unknown platform: ${platform}`)
      }

      logger.debug({ params, count: members.length }, 'Group members retrieved')

      return members
    }
    catch (error) {
      logger.error({ error, params }, 'Failed to get group members')
      throw error
    }
  }

  /**
   * 设置管理员
   */
  async setAdmin(params: SetAdminParams): Promise<void> {
    logger.debug({ params }, 'Setting admin')

    try {
      // 获取实例
      if (!this.instanceResolver) {
        throw new Error('Instance resolver not configured (Phase 4)')
      }

      const instance = this.instanceResolver(params.instanceId)
      if (!instance) {
        throw new Error(`Instance ${params.instanceId} not found`)
      }

      // 解析 ID
      const { platform: groupPlatform, id: groupId } = this.parseGroupId(params.groupId)
      const { platform: userPlatform, id: userId } = this.parseUserId(params.userId)

      if (groupPlatform !== userPlatform) {
        throw new Error('Group and user must be on the same platform')
      }

      // 根据平台设置管理员
      if (groupPlatform === 'qq') {
        await this.setQQAdmin(instance, groupId, userId, params.enable)
      }
      else if (groupPlatform === 'tg') {
        await this.setTGAdmin(instance, groupId, userId, params.enable)
      }
      else {
        throw new Error(`Unknown platform: ${groupPlatform}`)
      }

      logger.info({ params }, 'Admin status updated')
    }
    catch (error) {
      logger.error({ error, params }, 'Failed to set admin')
      throw error
    }
  }

  /**
   * 禁言用户
   */
  async muteUser(params: MuteUserParams): Promise<void> {
    logger.debug({ params }, 'Muting user')

    try {
      // 获取实例
      if (!this.instanceResolver) {
        throw new Error('Instance resolver not configured (Phase 4)')
      }

      const instance = this.instanceResolver(params.instanceId)
      if (!instance) {
        throw new Error(`Instance ${params.instanceId} not found`)
      }

      // 解析 ID
      const { platform: groupPlatform, id: groupId } = this.parseGroupId(params.groupId)
      const { platform: userPlatform, id: userId } = this.parseUserId(params.userId)

      if (groupPlatform !== userPlatform) {
        throw new Error('Group and user must be on the same platform')
      }

      // 根据平台禁言
      if (groupPlatform === 'qq') {
        await this.muteQQUser(instance, groupId, userId, params.duration)
      }
      else if (groupPlatform === 'tg') {
        await this.muteTGUser(instance, groupId, userId, params.duration)
      }
      else {
        throw new Error(`Unknown platform: ${groupPlatform}`)
      }

      logger.info({ params }, 'User muted')
    }
    catch (error) {
      logger.error({ error, params }, 'Failed to mute user')
      throw error
    }
  }

  /**
   * 踢出用户
   */
  async kickUser(params: KickUserParams): Promise<void> {
    logger.debug({ params }, 'Kicking user')

    try {
      // 获取实例
      if (!this.instanceResolver) {
        throw new Error('Instance resolver not configured (Phase 4)')
      }

      const instance = this.instanceResolver(params.instanceId)
      if (!instance) {
        throw new Error(`Instance ${params.instanceId} not found`)
      }

      // 解析 ID
      const { platform: groupPlatform, id: groupId } = this.parseGroupId(params.groupId)
      const { platform: userPlatform, id: userId } = this.parseUserId(params.userId)

      if (groupPlatform !== userPlatform) {
        throw new Error('Group and user must be on the same platform')
      }

      // 根据平台踢出
      if (groupPlatform === 'qq') {
        await this.kickQQUser(instance, groupId, userId, params.rejectAddRequest)
      }
      else if (groupPlatform === 'tg') {
        await this.kickTGUser(instance, groupId, userId)
      }
      else {
        throw new Error(`Unknown platform: ${groupPlatform}`)
      }

      logger.info({ params }, 'User kicked')
    }
    catch (error) {
      logger.error({ error, params }, 'Failed to kick user')
      throw error
    }
  }

  // === 私有方法 ===

  /**
   * 解析群组 ID
   */
  private parseGroupId(groupId: string): { platform: 'qq' | 'tg', id: string } {
    const parts = groupId.split(':')
    if (parts.length < 3) {
      throw new Error(`Invalid groupId format: ${groupId}`)
    }

    const platform = parts[0] as 'qq' | 'tg'
    const id = parts.slice(2).join(':')

    return { platform, id }
  }

  /**
   * 解析用户 ID
   */
  private parseUserId(userId: string): { platform: 'qq' | 'tg', id: string } {
    const parts = userId.split(':')
    if (parts.length < 3) {
      throw new Error(`Invalid userId format: ${userId}`)
    }

    const platform = parts[0] as 'qq' | 'tg'
    const id = parts.slice(2).join(':')

    return { platform, id }
  }

  // === QQ 平台方法（Phase 4 实现） ===

  private async getQQGroupInfo(_instance: any, _groupId: string): Promise<GroupInfo | null> {
    return null
  }

  private async getQQGroupMembers(_instance: any, _groupId: string): Promise<GroupMember[]> {
    return []
  }

  private async setQQAdmin(_instance: any, _groupId: string, _userId: string, _enable: boolean): Promise<void> {
    // Phase 4: instance.qqClient.setGroupAdmin()
  }

  private async muteQQUser(_instance: any, _groupId: string, _userId: string, _duration: number): Promise<void> {
    // Phase 4: instance.qqClient.muteGroupMember()
  }

  private async kickQQUser(_instance: any, _groupId: string, _userId: string, _reject?: boolean): Promise<void> {
    // Phase 4: instance.qqClient.kickGroupMember()
  }

  // === TG 平台方法（Phase 4 实现） ===

  private async getTGGroupInfo(_instance: any, _chatId: string): Promise<GroupInfo | null> {
    return null
  }

  private async getTGGroupMembers(_instance: any, _chatId: string): Promise<GroupMember[]> {
    return []
  }

  private async setTGAdmin(_instance: any, _chatId: string, _userId: string, _enable: boolean): Promise<void> {
    // Phase 4: instance.tgBot.promoteChatMember()
  }

  private async muteTGUser(_instance: any, _chatId: string, _userId: string, _duration: number): Promise<void> {
    // Phase 4: instance.tgBot.restrictChatMember()
  }

  private async kickTGUser(_instance: any, _chatId: string, _userId: string): Promise<void> {
    // Phase 4: instance.tgBot.banChatMember()
  }
}

/**
 * 创建群组 API
 */
export function createGroupAPI(instanceResolver?: (instanceId: number) => any): GroupAPI {
  return new GroupAPIImpl(instanceResolver)
}
