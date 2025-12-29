import type { Chat } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/node'
import type Telegram from '../client'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TelegramChat from '../chat'

// Mock @mtcute/core/methods.js
vi.mock('@mtcute/core/methods.js', () => ({
  deleteMessagesById: vi.fn(),
}))

describe('telegramChat', () => {
  let mockClient: TelegramClient
  let mockParent: Telegram
  let mockChat: Chat
  let telegramChat: TelegramChat

  beforeEach(() => {
    // Create mock TelegramClient
    mockClient = {
      sendText: vi.fn(),
      setChatPhoto: vi.fn(),
      setChatDescription: vi.fn(),
      setChatTitle: vi.fn(),
      createInviteLink: vi.fn(),
      getChatMember: vi.fn(),
      addChatMembers: vi.fn(),
      setTyping: vi.fn(),
    } as any

    // Create mock parent
    mockParent = {} as Telegram

    // Create mock chat
    mockChat = {
      id: 123456789,
    } as Chat

    // Create TelegramChat instance
    telegramChat = new TelegramChat(mockParent, mockClient, mockChat)
  })

  it('should initialize with correct properties', () => {
    expect(telegramChat.id).toBe(123456789)
    expect(telegramChat.parent).toBe(mockParent)
    expect(telegramChat.chat).toBe(mockChat)
  })

  describe('sendMessage', () => {
    it('should send text message', async () => {
      const mockResult = { id: 1, chatId: 123456789 }
      vi.mocked(mockClient.sendText).mockResolvedValue(mockResult as any)

      const result = await telegramChat.sendMessage('Hello, World!')

      expect(mockClient.sendText).toHaveBeenCalledWith(123456789, 'Hello, World!', undefined)
      expect(result).toBe(mockResult)
    })

    it('should send message with params', async () => {
      const mockResult = { id: 2, chatId: 123456789 }
      const params = { replyToMessageId: 100 }
      vi.mocked(mockClient.sendText).mockResolvedValue(mockResult as any)

      const result = await telegramChat.sendMessage('Reply message', params)

      expect(mockClient.sendText).toHaveBeenCalledWith(123456789, 'Reply message', params)
      expect(result).toBe(mockResult)
    })
  })

  describe('setProfilePhoto', () => {
    it('should set profile photo with Buffer', async () => {
      const mockBuffer = Buffer.from('photo data')
      const mockResult = { success: true }
      vi.mocked(mockClient.setChatPhoto).mockResolvedValue(mockResult as any)

      const result = await telegramChat.setProfilePhoto(mockBuffer)

      expect(mockClient.setChatPhoto).toHaveBeenCalledWith({
        chatId: 123456789,
        media: mockBuffer,
        type: 'photo',
      })
      expect(result).toBe(mockResult)
    })

    it('should set profile photo with string path', async () => {
      const photoPath = '/path/to/photo.jpg'
      const mockResult = { success: true }
      vi.mocked(mockClient.setChatPhoto).mockResolvedValue(mockResult as any)

      const result = await telegramChat.setProfilePhoto(photoPath)

      expect(mockClient.setChatPhoto).toHaveBeenCalledWith({
        chatId: 123456789,
        media: photoPath,
        type: 'photo',
      })
      expect(result).toBe(mockResult)
    })
  })

  describe('setAdmin', () => {
    it('should throw error for unimplemented functionality', async () => {
      await expect(telegramChat.setAdmin(987654321)).rejects.toThrow(
        'setAdmin 功能待完善：需要使用 mtcute 的 call() 方法调用 channels.editAdmin API',
      )
    })

    it('should pass through custom rights parameter', async () => {
      const customRights = {
        changeInfo: false,
        postMessages: false,
        editMessages: false,
        deleteMessages: true,
        banUsers: true,
        inviteUsers: false,
        pinMessages: false,
        manageCall: false,
        anonymous: false,
        manageTopics: false,
      }

      await expect(telegramChat.setAdmin(987654321, customRights)).rejects.toThrow(
        'setAdmin 功能待完善',
      )
    })
  })
  describe('editAbout', () => {
    it('should edit chat description', async () => {
      const mockResult = { success: true }
      vi.mocked(mockClient.setChatDescription).mockResolvedValue(mockResult as any)

      const result = await telegramChat.editAbout('New description')

      expect(mockClient.setChatDescription).toHaveBeenCalledWith(123456789, 'New description')
      expect(result).toBe(mockResult)
    })
  })

  describe('editTitle', () => {
    it('should edit chat title', async () => {
      const mockResult = { success: true }
      vi.mocked(mockClient.setChatTitle).mockResolvedValue(mockResult as any)

      const result = await telegramChat.editTitle('New Title')

      expect(mockClient.setChatTitle).toHaveBeenCalledWith(123456789, 'New Title')
      expect(result).toBe(mockResult)
    })
  })

  describe('getInviteLink', () => {
    it('should get invite link', async () => {
      const mockLink = 'https://t.me/joinchat/abc123'
      vi.mocked(mockClient.createInviteLink).mockResolvedValue(mockLink as any)

      const result = await telegramChat.getInviteLink()

      expect(mockClient.createInviteLink).toHaveBeenCalledWith(123456789)
      expect(result).toBe(mockLink)
    })
  })

  describe('getMember', () => {
    it('should get chat member info', async () => {
      const mockMember = { userId: 987654321, status: 'member' }
      vi.mocked(mockClient.getChatMember).mockResolvedValue(mockMember as any)

      const result = await telegramChat.getMember(987654321)

      expect(mockClient.getChatMember).toHaveBeenCalledWith({
        chatId: 123456789,
        userId: 987654321,
      })
      expect(result).toBe(mockMember)
    })
  })

  describe('deleteMessages', () => {
    it('should delete messages by IDs', async () => {
      const { deleteMessagesById } = await import('@mtcute/core/methods.js')
      const mockResult = { success: true }
      vi.mocked(deleteMessagesById).mockResolvedValue(mockResult as any)

      const messageIds = [1, 2, 3]
      const result = await telegramChat.deleteMessages(messageIds)

      expect(deleteMessagesById).toHaveBeenCalledWith(mockClient, 123456789, messageIds)
      expect(result).toBe(mockResult)
    })
  })

  describe('inviteMember', () => {
    it('should invite members to chat', async () => {
      const mockResult = { success: true }
      vi.mocked(mockClient.addChatMembers).mockResolvedValue(mockResult as any)

      const users = [111111, 222222, 333333]
      const result = await telegramChat.inviteMember(users)

      expect(mockClient.addChatMembers).toHaveBeenCalledWith(123456789, users, { forwardCount: 0 })
      expect(result).toBe(mockResult)
    })
  })

  describe('setTyping', () => {
    it('should set typing status with default action', async () => {
      const mockResult = { success: true }
      vi.mocked(mockClient.setTyping).mockResolvedValue(mockResult as any)

      const result = await telegramChat.setTyping()

      expect(mockClient.setTyping).toHaveBeenCalledWith({
        peerId: 123456789,
        status: 'typing',
      })
      expect(result).toBe(mockResult)
    })

    it('should set typing status with custom action', async () => {
      const mockResult = { success: true }
      vi.mocked(mockClient.setTyping).mockResolvedValue(mockResult as any)

      const result = await telegramChat.setTyping('upload_photo')

      expect(mockClient.setTyping).toHaveBeenCalledWith({
        peerId: 123456789,
        status: 'upload_photo',
      })
      expect(result).toBe(mockResult)
    })
  })
})
