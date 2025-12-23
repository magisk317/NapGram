import type { Chat, InputPeerLike, InputText } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/node'
import type { Buffer } from 'node:buffer'
import type Telegram from './client'
// import createPaginatedInlineSelector from '../../../shared/utils/paginatedInlineSelector';
// import inlineDigitInput from '../../../shared/utils/inlineDigitInput';
// import { TelegramImportSession } from './session';

export default class TelegramChat {
  public readonly id: number

  constructor(
    public readonly parent: Telegram,
    private readonly client: TelegramClient,
    public readonly chat: Chat,
    // private readonly waitForInputHelper: WaitForMessageHelper
  ) {
    this.id = chat.id
  }

  public async sendMessage(text: InputText, params?: Parameters<TelegramClient['sendText']>[2]) {
    return await this.client.sendText(this.id, text, params)
  }

  // public async getMessage(params: Parameters<typeof this.client.getMessages>[1]) {
  //   const messages = await this.client.getMessages(this.entity, params);
  //   return messages[0];
  // }

  // public async sendSelfDestructingPhoto(params: SendMessageParams, photo: CustomFile, ttlSeconds: number) {
  //   // @ts-ignore 定义不好好写的？你家 `FileLike` 明明可以是 `TypeInputMedia`
  //   params.file = new Api.InputMediaUploadedPhoto({
  //     file: await this.client.uploadFile({
  //       file: photo,
  //       workers: 1,
  //     }),
  //     ttlSeconds,
  //   });
  //   return await this.client.sendMessage(this.entity, params);
  // }

  // public async waitForInput() {
  //   return this.waitForInputHelper.waitForMessage(this.entity.id);
  // }

  // public cancelWait() {
  //   this.waitForInputHelper.cancel(this.entity.id);
  // }

  // public createPaginatedInlineSelector(message: string, choices: ButtonLike[][]) {
  //   return createPaginatedInlineSelector(this, message, choices);
  // }

  // public inlineDigitInput(length: number) {
  //   return inlineDigitInput(this, length);
  // }

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
    try {
      // 默认管理员权限
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

      // TODO: 使用 mtcute 的底层 MTProto API
      // 当前暂不实现，标记为待完善
      // await this.client.call({
      //     _: 'channels.editAdmin',
      //     channel: this.id,
      //     userId: user,
      //     adminRights: adminRights,
      //     rank: '',
      // });

      throw new Error('setAdmin 功能待完善：需要使用 mtcute 的 call() 方法调用 channels.editAdmin API')
    }
    catch (error: any) {
      // 处理常见错误
      if (error.message?.includes('CHAT_ADMIN_REQUIRED')) {
        throw new Error('机器人需要管理员权限才能提升其他用户')
      }
      else if (error.message?.includes('USER_NOT_PARTICIPANT')) {
        throw new Error('目标用户不在群组中')
      }
      else if (error.message?.includes('CHAT_NOT_MODIFIED')) {
        throw new Error('用户已经是管理员')
      }
      throw error
    }
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
    // 使用 mtcute 的底层 API 直接删除
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

  // public async startImportSession(textFile: CustomFile, mediaCount: number) {
  //   await this.client.invoke(
  //     new Api.messages.CheckHistoryImportPeer({
  //       peer: this.entity,
  //     }),
  //   );
  //   const init = await this.client.invoke(
  //     new Api.messages.InitHistoryImport({
  //       peer: this.entity,
  //       file: await this.client.uploadFile({
  //         file: textFile,
  //         workers: 1,
  //       }),
  //       mediaCount,
  //     }),
  //   );
  //   return new TelegramImportSession(this, this.client, init.id);
  // }
}
