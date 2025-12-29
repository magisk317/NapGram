import type { Chat, InputPeerLike, InputText } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/node'
import type { Buffer } from 'node:buffer'
import type Telegram from './client'

export default class TelegramChat {
  public readonly id: number

  constructor(
    public readonly parent: Telegram,
    private readonly client: TelegramClient,
    public readonly chat: Chat,
  ) {
    this.id = chat.id
  }

  public async sendMessage(text: InputText, params?: Parameters<TelegramClient['sendText']>[2]) {
    return await this.client.sendText(this.id, text, params)
  }

  /**
   * 设置聊天头像
   */
  public async setProfilePhoto(photo: Buffer | string) {
    return await this.client.setChatPhoto({
      chatId: this.id,
      media: photo,
      type: 'photo',
    })
  }

  /**
   * 设置管理员
   * 使用 mtcute 的底层 call 方法调用 channels.editAdmin
   */
  public async setAdmin(user: InputPeerLike, rights?: any) {
    const _adminRights = rights || {
      changeInfo: true,
      postMessages: true,
      editMessages: true,
      deleteMessages: true,
      banUsers: true,
      inviteUsers: true,
      pinMessages: true,
      manageCall: true,
      anonymous: false,
      manageTopics: false,
    }

    void _adminRights
    throw new Error('setAdmin 功能待完善：需要使用 mtcute 的 call() 方法调用 channels.editAdmin API')
  }

  public async editAbout(about: string) {
    return await this.client.setChatDescription(this.id, about)
  }

  public async editTitle(title: string) {
    return await this.client.setChatTitle(this.id, title)
  }

  public async getInviteLink() {
    return await this.client.createInviteLink(this.id)
  }

  /**
   * 获取聊天成员信息
   */
  public async getMember(user: InputPeerLike) {
    return await this.client.getChatMember({
      chatId: this.id,
      userId: user,
    })
  }

  /**
   * 删除消息
   * 注意: mtcute 的 deleteMessages 接受 Message 数组，但也有 deleteMessagesById
   */
  public async deleteMessages(messageIds: number[]) {
    const { deleteMessagesById } = await import('@mtcute/core/methods.js')
    return await deleteMessagesById(this.client as any, this.id, messageIds)
  }

  /**
   * 邀请成员
   */
  public async inviteMember(users: InputPeerLike[]) {
    return await this.client.addChatMembers(this.id, users, { forwardCount: 0 })
  }

  /**
   * 设置打字状态
   */
  public async setTyping(action: string = 'typing') {
    return await this.client.setTyping({
      peerId: this.id,
      status: action as any,
    })
  }
}
