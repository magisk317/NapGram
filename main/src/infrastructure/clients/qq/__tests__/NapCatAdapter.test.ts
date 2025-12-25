import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { NapCatAdapter } from '../NapCatAdapter'

// Mock dependencies
const { mockNapLinkInstance, mockLogger, mockMessageConverter, mockNapCatForwardMultiple } = vi.hoisted(() => {
  const mockNapLink = {
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    sendGroupForwardMessage: vi.fn(),
    deleteMessage: vi.fn(),
    getMessage: vi.fn(),
    getForwardMessage: vi.fn(),
    getFile: vi.fn(),
    getFriendList: vi.fn(),
    getGroupList: vi.fn(),
    getGroupMemberList: vi.fn(),
    getStrangerInfo: vi.fn(),
    getGroupInfo: vi.fn(),
    getGroupMemberInfo: vi.fn(),
    callApi: vi.fn(),
    getLoginInfo: vi.fn(),
    getStatus: vi.fn(),
    setGroupBan: vi.fn(),
    unsetGroupBan: vi.fn(),
    setGroupKick: vi.fn(),
    setGroupCard: vi.fn(),
    setGroupWholeBan: vi.fn(),
    setGroupAdmin: vi.fn(),
    setGroupName: vi.fn(),
    setGroupSpecialTitle: vi.fn(),
    handleFriendRequest: vi.fn(),
    handleGroupRequest: vi.fn(),
    sendLike: vi.fn(),
    getGroupHonorInfo: vi.fn(),
    hydrateMessage: vi.fn(),
    api: {
      getStrangerInfo: vi.fn(),
      getVersionInfo: vi.fn(),
      hydrateMedia: vi.fn(),
      getImage: vi.fn(),
      getRecord: vi.fn(),
      sendPrivateMessage: vi.fn(),
      sendGroupMessage: vi.fn(),
      setEssenceMessage: vi.fn(),
      deleteEssenceMessage: vi.fn(),
      getEssenceMessageList: vi.fn(),
      markMessageAsRead: vi.fn(),
      getGroupAtAllRemain: vi.fn(),
      getGroupSystemMsg: vi.fn(),
      setGroupLeave: vi.fn(),
      setGroupAnonymousBan: vi.fn(),
      uploadGroupFile: vi.fn(),
      uploadPrivateFile: vi.fn(),
      setGroupPortrait: vi.fn(),
      getGroupFileSystemInfo: vi.fn(),
      getGroupRootFiles: vi.fn(),
      getGroupFilesByFolder: vi.fn(),
      getGroupFileUrl: vi.fn(),
      deleteGroupFile: vi.fn(),
      createGroupFileFolder: vi.fn(),
      deleteGroupFolder: vi.fn(),
      downloadFile: vi.fn(),
      uploadFileStream: vi.fn(),
      getUploadStreamStatus: vi.fn(),
      sendGroupPoke: vi.fn(),
      sendFriendPoke: vi.fn(),
      sendPoke: vi.fn(),
      markGroupMsgAsRead: vi.fn(),
      markPrivateMsgAsRead: vi.fn(),
      markAllMsgAsRead: vi.fn(),
      getGroupMsgHistory: vi.fn(),
      getFriendMsgHistory: vi.fn(),
      getRecentContact: vi.fn(),
      downloadFileStreamToFile: vi.fn(),
      downloadFileImageStreamToFile: vi.fn(),
      downloadFileRecordStreamToFile: vi.fn(),
      cleanStreamTempFile: vi.fn(),
      getOnlineClients: vi.fn(),
      getRobotUinRange: vi.fn(),
      canSendImage: vi.fn(),
      canSendRecord: vi.fn(),
      getCookies: vi.fn(),
      getCsrfToken: vi.fn(),
      getCredentials: vi.fn(),
      setInputStatus: vi.fn(),
      ocrImage: vi.fn(),
      translateEn2zh: vi.fn(),
      checkUrlSafely: vi.fn(),
      handleQuickOperation: vi.fn(),
      getModelShow: vi.fn(),
      setModelShow: vi.fn(),
      getPacketStatus: vi.fn(),
      getRkeyEx: vi.fn(),
      getRkeyServer: vi.fn(),
      getRkey: vi.fn(),
      setFriendRemark: vi.fn(),
      deleteFriend: vi.fn(),
      getUnidirectionalFriendList: vi.fn(),
      setGroupRemark: vi.fn(),
      getGroupInfoEx: vi.fn(),
      getGroupDetailInfo: vi.fn(),
      getGroupIgnoredNotifies: vi.fn(),
      getGroupShutList: vi.fn(),
      sendPrivateForwardMessage: vi.fn(),
      forwardFriendSingleMsg: vi.fn(),
      forwardGroupSingleMsg: vi.fn(),
      sendForwardMsg: vi.fn(),
      sendGroupNotice: vi.fn(),
      getGroupNotice: vi.fn(),
      delGroupNotice: vi.fn(),
      setOnlineStatus: vi.fn(),
      setDiyOnlineStatus: vi.fn(),
      sendArkShare: vi.fn(),
      sendGroupArkShare: vi.fn(),
      getMiniAppArk: vi.fn(),
      getAiCharacters: vi.fn(),
      getAiRecord: vi.fn(),
      sendGroupAiRecord: vi.fn(),
      setGroupSign: vi.fn(),
      sendGroupSign: vi.fn(),
      getClientkey: vi.fn(),
      clickInlineKeyboardButton: vi.fn(),
    }
  }

  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }

  const mockMsgConv = {
    fromNapCat: vi.fn(),
    toNapCat: vi.fn()
  }

  const mockNapCatFwd = vi.fn()

  return {
    mockNapLinkInstance: mockNapLink,
    mockLogger: mockLog,
    mockMessageConverter: mockMsgConv,
    mockNapCatForwardMultiple: mockNapCatFwd
  }
})

vi.mock('@naplink/naplink', () => {
  return {
    NapLink: vi.fn(function () { return mockNapLinkInstance })
  }
})

vi.mock('../../../../shared/logger', () => ({
  getLogger: vi.fn(() => mockLogger)
}))


vi.mock('../../../../domain/message/converter', () => ({
  messageConverter: mockMessageConverter
}))

vi.mock('../napcatConvert', () => ({
  napCatForwardMultiple: mockNapCatForwardMultiple // Use hoisted variable
}))

import { messageConverter } from '../../../../domain/message/converter'
import { napCatForwardMultiple } from '../napcatConvert'

describe('NapCatAdapter', () => {
  let adapter: NapCatAdapter
  const createParams = {
    wsUrl: 'ws://localhost:3000',
    reconnect: true
  }

  const waitTick = () => new Promise(resolve => setTimeout(resolve, 10))

  // Helper to trigger an event on the mock client
  const triggerClientEvent = (event: string, ...args: any[]) => {
    // Find the call to .on(event, handler)
    const calls = mockNapLinkInstance.on.mock.calls
    const handler = calls.find((c: any) => c[0] === event)?.[1]
    if (handler) handler(...args)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset resolved values to avoid pollution
    mockNapLinkInstance.getMessage.mockReset()
    mockNapLinkInstance.getLoginInfo.mockReset()
    mockNapLinkInstance.hydrateMessage.mockReset()
    mockMessageConverter.toNapCat.mockReset()
    mockMessageConverter.fromNapCat.mockReset()
    mockNapLinkInstance.sendMessage.mockReset()
    mockNapLinkInstance.getFile.mockReset()
    mockNapLinkInstance.getFriendList.mockReset()
    mockNapLinkInstance.getGroupList.mockReset()
    mockNapLinkInstance.getGroupMemberList.mockReset()
    mockNapLinkInstance.getStrangerInfo.mockReset()
    mockNapLinkInstance.getGroupInfo.mockReset()
    mockNapLinkInstance.getGroupMemberInfo.mockReset()
    mockNapLinkInstance.setGroupBan.mockReset()
    mockNapLinkInstance.unsetGroupBan.mockReset()
    mockNapLinkInstance.setGroupKick.mockReset()
    mockNapLinkInstance.setGroupCard.mockReset()
    mockNapLinkInstance.setGroupWholeBan.mockReset()
    mockNapLinkInstance.setGroupAdmin.mockReset()
    mockNapLinkInstance.setGroupName.mockReset()
    mockNapLinkInstance.setGroupSpecialTitle.mockReset()
    mockNapLinkInstance.handleFriendRequest.mockReset()
    mockNapLinkInstance.handleGroupRequest.mockReset()
    mockNapLinkInstance.sendLike.mockReset()
    mockNapLinkInstance.getGroupHonorInfo.mockReset()

    // Default success overrides
    mockNapLinkInstance.hydrateMessage.mockResolvedValue(undefined)
    mockNapLinkInstance.getLoginInfo.mockResolvedValue({ user_id: 123456, nickname: 'Me' })

    adapter = new NapCatAdapter(createParams)
  })

  it('should initialize correctly', () => {
    expect(adapter.clientType).toBe('napcat')
    expect(mockNapLinkInstance.on).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(mockNapLinkInstance.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    expect(mockNapLinkInstance.on).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('should handle connect event', () => {
    const onOnline = vi.fn()
    adapter.on('online', onOnline)

    mockNapLinkInstance.getLoginInfo.mockResolvedValue({ user_id: 123456, nickname: 'TestUser' })

    triggerClientEvent('connect')

    expect(onOnline).toHaveBeenCalled()
    expect(mockNapLinkInstance.getLoginInfo).toHaveBeenCalled()
    // We can't check adapter.uin directly unless getting it via getter
    expect(adapter.uin).toBe(0) // It's async, so initially 0. Wait for promise?
  })

  it('should update self info on connect', async () => {
    mockNapLinkInstance.getLoginInfo.mockResolvedValue({ user_id: 9991, nickname: 'Updated1' })
    triggerClientEvent('connect')

    // Wait for async refreshSelfInfo
    await waitTick()

    expect(adapter.uin).toBe(9991)
    expect(adapter.nickname).toBe('Updated1')
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Logged in as Updated1'))
  })

  it('should handle getLoginInfo failure', async () => {
    mockNapLinkInstance.getLoginInfo.mockRejectedValue(new Error('Login fail'))
    triggerClientEvent('connect')
    await new Promise(process.nextTick)
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to get login info'), expect.any(Error))
  })

  it('should handle disconnect event', () => {
    const onOffline = vi.fn()
    adapter.on('offline', onOffline)
    triggerClientEvent('disconnect')
    expect(onOffline).toHaveBeenCalled()
  })

  it('should handle connection lost', () => {
    const onLost = vi.fn()
    adapter.on('connection:lost', onLost)
    triggerClientEvent('connection:lost', { timestamp: 1000, attempts: 5 })
    expect(onLost).toHaveBeenCalledWith({ timestamp: 1000, reason: expect.stringContaining('exceeded (5)') })
  })

  it('should handle connection restored', () => {
    const onRestored = vi.fn()
    adapter.on('connection:restored', onRestored)
    triggerClientEvent('connection:restored', { timestamp: 2000 })
    expect(onRestored).toHaveBeenCalledWith({ timestamp: 2000 })
  })

  it('should check isOnline status', async () => {
    mockNapLinkInstance.getStatus.mockResolvedValue({ online: true })
    expect(await adapter.isOnline()).toBe(true)

    mockNapLinkInstance.getStatus.mockResolvedValue({ online: false })
    expect(await adapter.isOnline()).toBe(false)

    mockNapLinkInstance.getStatus.mockRejectedValue(new Error('fail'))
    expect(await adapter.isOnline()).toBe(false)
  })

  describe('Message Events', () => {
    it('should handle incoming message', async () => {
      const onMessage = vi.fn()
      adapter.on('message', onMessage)

      const rawMsg = {
        message: [{ type: 'text', data: { text: 'hello' } }]
      }
      mockMessageConverter.fromNapCat.mockReturnValue({ id: 'msg1', content: 'hello' })

      triggerClientEvent('message', rawMsg)
      await waitTick()

      expect(mockNapLinkInstance.hydrateMessage).toHaveBeenCalled()
      expect(mockMessageConverter.fromNapCat).toHaveBeenCalledWith(rawMsg)
      expect(onMessage).toHaveBeenCalledWith({ id: 'msg1', content: 'hello' })
    })

    it('should normalize media IDs in message', async () => {
      // Test normalizeMediaIds private method indirectly via message event
      const rawMsg = {
        message: [
          { type: 'image', data: { file: '/img.png' } },
          { type: 'file', data: { file_id: '/file.doc' } },
          { type: 'video', data: { file: 'path/clean.mp4' } } // already clean
        ]
      }
      triggerClientEvent('message', rawMsg)
      await waitTick()

      // Check side effects on rawMsg (since it's passed by reference)
      expect(rawMsg.message[0].data.file).toBe('img.png')
      expect(rawMsg.message[1].data.file_id).toBe('file.doc')
      expect(rawMsg.message[2].data.file).toBe('path/clean.mp4')
    })

    it('should handle message processing error', async () => {
      mockNapLinkInstance.hydrateMessage.mockRejectedValue(new Error('Hydrate failed'))
      triggerClientEvent('message', {})
      await waitTick()
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to handle message event'), expect.any(Error))
    })
  })

  describe('Notice Events', () => {
    it('should handle group recall', () => {
      const onRecall = vi.fn()
      adapter.on('recall', onRecall)
      triggerClientEvent('notice.group_recall', {
        message_id: 100, group_id: 200, operator_id: 300, time: 1234567890
      })
      expect(onRecall).toHaveBeenCalledWith({
        messageId: '100', chatId: '200', operatorId: '300', timestamp: 1234567890000
      })
    })

    it('should handle friend recall', () => {
      const onRecall = vi.fn()
      adapter.on('recall', onRecall)
      triggerClientEvent('notice.friend_recall', {
        message_id: 101, user_id: 400, time: 1234567890
      })
      expect(onRecall).toHaveBeenCalledWith({
        messageId: '101', chatId: '400', operatorId: '400', timestamp: 1234567890000
      })
    })

    it('should handle group increase/decrease', () => {
      const onGroupIncrease = vi.fn()
      const onGroupDecrease = vi.fn()
      adapter.on('group.increase', onGroupIncrease)
      adapter.on('group.decrease', onGroupDecrease)

      triggerClientEvent('notice.group_increase', { group_id: 10, user_id: 11 })
      expect(onGroupIncrease).toHaveBeenCalledWith('10', { id: '11', name: '' })

      triggerClientEvent('notice.group_decrease', { group_id: 10, user_id: 12 })
      expect(onGroupDecrease).toHaveBeenCalledWith('10', '12')
    })

    it('should handle friend add', () => {
      const onFriendIncrease = vi.fn()
      adapter.on('friend.increase', onFriendIncrease)
      triggerClientEvent('notice.friend_add', { user_id: 20 })
      expect(onFriendIncrease).toHaveBeenCalledWith({ id: '20', name: '' })
    })

    it('should handle poke', () => {
      const onPoke = vi.fn()
      adapter.on('poke', onPoke)
      // Group poke
      triggerClientEvent('notice.notify.poke', { group_id: 50, user_id: 60, target_id: 70 })
      expect(onPoke).toHaveBeenCalledWith('50', '60', '70')

      // Private poke (group_id missing)
      triggerClientEvent('notice.notify.poke', { user_id: 60, target_id: 70 })
      expect(onPoke).toHaveBeenCalledWith('60', '60', '70')
    })
  })

  describe('Request Events', () => {
    it('should handle friend request', () => {
      const onRequest = vi.fn()
      adapter.on('request.friend', onRequest)
      triggerClientEvent('request.friend', { flag: 'f1', user_id: 33, comment: 'hi', time: 123 })
      expect(onRequest).toHaveBeenCalledWith({
        flag: 'f1', userId: '33', comment: 'hi', timestamp: 123000
      })
    })

    it('should handle group request', () => {
      const onRequest = vi.fn()
      adapter.on('request.group', onRequest)
      triggerClientEvent('request.group', { flag: 'g1', group_id: 44, user_id: 55, sub_type: 'add', comment: 'join', time: 456 })
      expect(onRequest).toHaveBeenCalledWith({
        flag: 'g1', groupId: '44', userId: '55', subType: 'add', comment: 'join', timestamp: 456000
      })
    })
  })

  describe('Message Operations', () => {
    it('should send group message with conversion', async () => {
      const msg: any = { chat: { type: 'group' }, content: 'hello' }
      mockMessageConverter.toNapCat.mockResolvedValue(['converted'])
      mockNapLinkInstance.sendMessage.mockResolvedValue({ message_id: 12345 })

      const receipt = await adapter.sendMessage('100', msg)

      expect(mockMessageConverter.toNapCat).toHaveBeenCalledWith(msg)
      expect(mockNapLinkInstance.sendMessage).toHaveBeenCalledWith({
        group_id: 100, message: ['converted']
      })
      expect(receipt).toEqual({ messageId: '12345', timestamp: expect.any(Number), success: true })
    })

    it('should send private message with pre-converted segments', async () => {
      const msg: any = { chat: { type: 'private' }, content: ['pre'], __napCatSegments: true }
      mockNapLinkInstance.sendMessage.mockResolvedValue({ message_id: 67890 })

      const receipt = await adapter.sendMessage('200', msg)

      expect(mockMessageConverter.toNapCat).not.toHaveBeenCalled()
      expect(mockNapLinkInstance.sendMessage).toHaveBeenCalledWith({
        user_id: 200, message: ['pre']
      })
      expect(receipt).toEqual({ messageId: '67890', timestamp: expect.any(Number), success: true })
    })

    it('should handle sendMessage error', async () => {
      // Use __napCatSegments to bypass converter and force error in sendMessage call
      mockNapLinkInstance.sendMessage.mockRejectedValue(new Error('Send fail'))

      const receipt = await adapter.sendMessage('300', { chat: { type: 'private' }, content: [], __napCatSegments: true } as any)
      expect(receipt).toEqual({ messageId: '', timestamp: expect.any(Number), success: false, error: 'Send fail' })
    })

    it('should send group forward message', async () => {
      mockNapLinkInstance.sendGroupForwardMessage.mockResolvedValue({ message_id: 111 })
      const receipt = await adapter.sendGroupForwardMsg('400', [])
      expect(mockNapLinkInstance.sendGroupForwardMessage).toHaveBeenCalledWith('400', [])
      expect(receipt).toEqual({ messageId: '111', timestamp: expect.any(Number), success: true })

      mockNapLinkInstance.sendGroupForwardMessage.mockRejectedValue(new Error('Fail'))
      const receipt2 = await adapter.sendGroupForwardMsg('400', [])
      expect(receipt2.success).toBe(false)
    })

    it('should recall message', async () => {
      await adapter.recallMessage('555')
      expect(mockNapLinkInstance.deleteMessage).toHaveBeenCalledWith('555')
    })

    it('should get message', async () => {
      mockNapLinkInstance.getMessage.mockResolvedValue({ raw: 'msg' })
      mockMessageConverter.fromNapCat.mockReturnValue({ id: 'mapped' })

      const res = await adapter.getMessage('666')
      expect(mockNapLinkInstance.getMessage).toHaveBeenCalledWith('666')
      expect(mockMessageConverter.fromNapCat).toHaveBeenCalledWith({ raw: 'msg' })
      expect(res).toEqual({ id: 'mapped' })

      mockNapLinkInstance.getMessage.mockRejectedValue(new Error('Not found'))
      const res2 = await adapter.getMessage('777')
      expect(res2).toBeNull()
    })

    it('should get forward message with hydration', async () => {
      const nodes = [
        { message: [{ type: 'image', data: { file: 'img.jpg' } }] },
        { message: null } // should handle empty/null
      ]
      mockNapLinkInstance.getForwardMessage.mockResolvedValue({ messages: nodes })
      napCatForwardMultiple.mockReturnValue(['convertedNode'])

      const res = await adapter.getForwardMsg('888')

      // normalizeMediaIds and hydrateMessage should be called
      // normalizeMediaIds modifies 'message' in place, hard to check directly unless we check hydrate call arg
      expect(mockNapLinkInstance.hydrateMessage).toHaveBeenCalled()
      expect(napCatForwardMultiple).toHaveBeenCalledWith(nodes)
      expect(res).toEqual(['convertedNode'])
    })

    it('should get file', async () => {
      mockNapLinkInstance.getFile.mockResolvedValue({ url: 'u' })
      await adapter.getFile('/path') // normalized
      expect(mockNapLinkInstance.getFile).toHaveBeenCalledWith('path')

      mockNapLinkInstance.getFile.mockRejectedValue(new Error('e'))
      expect(await adapter.getFile('p')).toBeNull()
    })
  })

  describe('Info & API Methods', () => {
    it('should get friend list', async () => {
      mockNapLinkInstance.getFriendList.mockResolvedValue([
        { user_id: 1, nickname: 'n1', remark: 'r1' }
      ])
      const list = await adapter.getFriendList()
      expect(list).toEqual([{ id: '1', name: 'n1' }])
    })

    it('should get group list', async () => {
      mockNapLinkInstance.getGroupList.mockResolvedValue([
        { group_id: 10, group_name: 'g1' }
      ])
      const list = await adapter.getGroupList()
      expect(list).toEqual([{ id: '10', type: 'group', name: 'g1' }])
    })

    it('should get group member list', async () => {
      mockNapLinkInstance.getGroupMemberList.mockResolvedValue([
        { user_id: 2, card: 'c2', nickname: 'n2' }
      ])
      const list = await adapter.getGroupMemberList('10')
      expect(mockNapLinkInstance.getGroupMemberList).toHaveBeenCalledWith('10')
      expect(list).toEqual([{ id: '2', name: 'c2' }])
    })

    it('should get friend info', async () => {
      mockNapLinkInstance.getStrangerInfo.mockResolvedValue({ user_id: 3, nickname: 'n3' })
      const info = await adapter.getFriendInfo('3')
      expect(info).toEqual({ id: '3', name: 'n3' })

      mockNapLinkInstance.getStrangerInfo.mockRejectedValue(new Error('no'))
      expect(await adapter.getFriendInfo('4')).toBeNull()
    })

    it('should get group info', async () => {
      mockNapLinkInstance.getGroupInfo.mockResolvedValue({ group_id: 11, group_name: 'g11' })
      const info = await adapter.getGroupInfo('11')
      expect(info).toEqual({ id: '11', type: 'group', name: 'g11' })

      mockNapLinkInstance.getGroupInfo.mockRejectedValue(new Error('no'))
      expect(await adapter.getGroupInfo('12')).toBeNull()
    })

    it('should pass through basic API calls', async () => {
      await adapter.getGroupMemberInfo('1', '2')
      expect(mockNapLinkInstance.getGroupMemberInfo).toHaveBeenCalledWith('1', '2')

      await adapter.getUserInfo('3')
      expect(mockNapLinkInstance.getStrangerInfo).toHaveBeenCalledWith('3')

      await adapter.login()
      expect(mockNapLinkInstance.connect).toHaveBeenCalled()

      await adapter.logout()
      expect(mockNapLinkInstance.disconnect).toHaveBeenCalled()

      await adapter.destroy()
      expect(mockNapLinkInstance.disconnect).toHaveBeenCalled()

      await adapter.callApi('method', { a: 1 })
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('method', { a: 1 })
    })

    it('should handle ban/kick user', async () => {
      await adapter.banUser('g', 'u', 100)
      expect(mockNapLinkInstance.setGroupBan).toHaveBeenCalledWith('g', 'u', 100)

      await adapter.unbanUser('g', 'u')
      expect(mockNapLinkInstance.unsetGroupBan).toHaveBeenCalledWith('g', 'u')

      await adapter.kickUser('g', 'u', true)
      expect(mockNapLinkInstance.setGroupKick).toHaveBeenCalledWith('g', 'u', true)

      await adapter.setGroupCard('g', 'u', 'card')
      expect(mockNapLinkInstance.setGroupCard).toHaveBeenCalledWith('g', 'u', 'card')
    })

    it('should handle advanced group config', async () => {
      await adapter.setGroupWholeBan('g', true)
      expect(mockNapLinkInstance.setGroupWholeBan).toHaveBeenCalledWith('g', true)

      await adapter.setGroupAdmin('g', 'u', true)
      expect(mockNapLinkInstance.setGroupAdmin).toHaveBeenCalledWith('g', 'u', true)

      await adapter.setGroupName('g', 'name')
      expect(mockNapLinkInstance.setGroupName).toHaveBeenCalledWith('g', 'name')

      await adapter.setGroupSpecialTitle('g', 'u', 'title', 10)
      expect(mockNapLinkInstance.setGroupSpecialTitle).toHaveBeenCalledWith('g', 'u', 'title', 10)
    })

    it('should handle requests', async () => {
      await adapter.handleFriendRequest('f', true, 'rem')
      expect(mockNapLinkInstance.handleFriendRequest).toHaveBeenCalledWith('f', true, 'rem')

      await adapter.handleGroupRequest('g', 'add', false, 'reason')
      expect(mockNapLinkInstance.handleGroupRequest).toHaveBeenCalledWith('g', 'add', false, 'reason')
    })

    it('should send like and get honor', async () => {
      await adapter.sendLike('u', 5)
      expect(mockNapLinkInstance.sendLike).toHaveBeenCalledWith('u', 5)

      await adapter.getGroupHonorInfo('g', 'all')
      expect(mockNapLinkInstance.getGroupHonorInfo).toHaveBeenCalledWith('g', 'all')
    })
    it('should delegate all API methods', async () => {
      const methods = [
        'getStrangerInfo', 'getVersionInfo', 'hydrateMedia', 'getImage', 'getRecord',
        'sendPrivateMessage', 'sendGroupMessage', 'setEssenceMessage', 'deleteEssenceMessage',
        'getEssenceMessageList', 'markMessageAsRead', 'getGroupAtAllRemain', 'getGroupSystemMsg',
        'setGroupLeave', 'setGroupAnonymousBan', 'uploadGroupFile', 'uploadPrivateFile',
        'setGroupPortrait', 'getGroupFileSystemInfo', 'getGroupRootFiles', 'getGroupFilesByFolder',
        'getGroupFileUrl', 'deleteGroupFile', 'createGroupFileFolder', 'deleteGroupFolder',
        'downloadFile', 'uploadFileStream', 'getUploadStreamStatus', 'sendGroupPoke',
        'sendFriendPoke', 'sendPoke', 'markGroupMsgAsRead', 'markPrivateMsgAsRead',
        'markAllMsgAsRead', 'getGroupMsgHistory', 'getFriendMsgHistory', 'getRecentContact',
        'downloadFileStreamToFile', 'downloadFileImageStreamToFile', 'downloadFileRecordStreamToFile',
        'cleanStreamTempFile', 'getOnlineClients', 'getRobotUinRange', 'canSendImage',
        'canSendRecord', 'getCookies', 'getCsrfToken', 'getCredentials', 'setInputStatus',
        'ocrImage', 'translateEn2zh', 'checkUrlSafely', 'handleQuickOperation', 'getModelShow',
        'setModelShow', 'getPacketStatus', 'getRkeyEx', 'getRkeyServer', 'getRkey',
        'setFriendRemark', 'deleteFriend', 'getUnidirectionalFriendList', 'setGroupRemark',
        'getGroupInfoEx', 'getGroupDetailInfo', 'getGroupIgnoredNotifies', 'getGroupShutList',
        'sendPrivateForwardMessage', 'forwardFriendSingleMsg', 'forwardGroupSingleMsg',
        'sendForwardMsg', 'sendGroupNotice', 'getGroupNotice', 'delGroupNotice', 'setOnlineStatus',
        'setDiyOnlineStatus', 'sendArkShare', 'sendGroupArkShare', 'getMiniAppArk',
        'getAiCharacters', 'getAiRecord', 'sendGroupAiRecord', 'setGroupSign', 'sendGroupSign',
        'getClientkey', 'clickInlineKeyboardButton'
      ]

      for (const method of methods) {
        // Ensure mock exists
        expect(mockNapLinkInstance.api).toHaveProperty(method)

        // Mock return value
        mockNapLinkInstance.api[method].mockResolvedValue('success')

        // Call adapter method (safely cast to any)
        const res = await (adapter as any)[method]('arg')

        // Verify delegation
        expect(mockNapLinkInstance.api[method]).toHaveBeenCalled()
        expect(res).toBe('success')
      }
    })
  })

  describe('Wrapper Error Handling', () => {
    it('should handle banUser error', async () => {
      mockNapLinkInstance.setGroupBan.mockRejectedValue(new Error('fail'))
      await expect(adapter.banUser('g', 'u', 100)).rejects.toThrow('fail')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle unbanUser error', async () => {
      mockNapLinkInstance.unsetGroupBan.mockRejectedValue(new Error('fail'))
      await expect(adapter.unbanUser('g', 'u')).rejects.toThrow('fail')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle kickUser error', async () => {
      mockNapLinkInstance.setGroupKick.mockRejectedValue(new Error('fail'))
      await expect(adapter.kickUser('g', 'u')).rejects.toThrow('fail')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle setGroupCard error', async () => {
      mockNapLinkInstance.setGroupCard.mockRejectedValue(new Error('fail'))
      await expect(adapter.setGroupCard('g', 'u', '')).rejects.toThrow('fail')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle setGroupWholeBan error', async () => {
      mockNapLinkInstance.setGroupWholeBan.mockRejectedValue(new Error('upstream'))
      await expect(adapter.setGroupWholeBan('g', true)).rejects.toThrow('设置全员禁言失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle setGroupAdmin error', async () => {
      mockNapLinkInstance.setGroupAdmin.mockRejectedValue(new Error('upstream'))
      await expect(adapter.setGroupAdmin('g', 'u', true)).rejects.toThrow('设置管理员失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle setGroupName error', async () => {
      mockNapLinkInstance.setGroupName.mockRejectedValue(new Error('upstream'))
      await expect(adapter.setGroupName('g', 'n')).rejects.toThrow('修改群名失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle setGroupSpecialTitle error', async () => {
      mockNapLinkInstance.setGroupSpecialTitle.mockRejectedValue(new Error('upstream'))
      await expect(adapter.setGroupSpecialTitle('g', 'u', 't')).rejects.toThrow('设置专属头衔失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle handleFriendRequest error', async () => {
      mockNapLinkInstance.handleFriendRequest.mockRejectedValue(new Error('upstream'))
      await expect(adapter.handleFriendRequest('f', true)).rejects.toThrow('处理好友申请失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle handleGroupRequest error', async () => {
      mockNapLinkInstance.handleGroupRequest.mockRejectedValue(new Error('upstream'))
      await expect(adapter.handleGroupRequest('g', 'add', true)).rejects.toThrow('处理加群申请失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle sendLike error', async () => {
      mockNapLinkInstance.sendLike.mockRejectedValue(new Error('upstream'))
      await expect(adapter.sendLike('u', 1)).rejects.toThrow('点赞失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should validate sendLike times', async () => {
      await expect(adapter.sendLike('u', 0)).rejects.toThrow('点赞次数必须在1-10之间')
      await expect(adapter.sendLike('u', 11)).rejects.toThrow('点赞次数必须在1-10之间')
    })

    it('should handle getGroupHonorInfo error', async () => {
      mockNapLinkInstance.getGroupHonorInfo.mockRejectedValue(new Error('upstream'))
      await expect(adapter.getGroupHonorInfo('g')).rejects.toThrow('获取群荣誉信息失败: upstream')
      await expect(adapter.getGroupHonorInfo('g')).rejects.toThrow('获取群荣誉信息失败: upstream')
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('API Fallbacks', () => {
    // Map of method name to expected callApi name and args
    const fallbacks: Record<string, [string, any]> = {
      getGroupShutList: ['get_group_shut_list', { group_id: 'g' }],
      sendPrivateForwardMessage: ['send_private_forward_msg', { u: 1 }],
      forwardFriendSingleMsg: ['forward_friend_single_msg', { user_id: 'u', message_id: 'm' }],
      forwardGroupSingleMsg: ['forward_group_single_msg', { group_id: 'g', message_id: 'm' }],
      sendForwardMsg: ['send_forward_msg', { f: 1 }],
      sendGroupNotice: ['_send_group_notice', { n: 1 }],
      getGroupNotice: ['_get_group_notice', { group_id: 'g' }],
      // delGroupNotice requires notice_id cast to number
      // setOnlineStatus, setDiyOnlineStatus have simpler args
      sendArkShare: ['send_ark_share', { a: 1 }],
      sendGroupArkShare: ['send_group_ark_share', { group_id: 'g' }],
      getMiniAppArk: ['get_mini_app_ark', { m: 1 }],
      getAiCharacters: ['get_ai_characters', { group_id: 'g', chat_type: 1 }],
      getAiRecord: ['get_ai_record', { group_id: 'g', character: 'c', text: 't' }],
      sendGroupAiRecord: ['send_group_ai_record', { group_id: 'g', character: 'c', text: 't' }],
      setGroupSign: ['set_group_sign', { group_id: 'g' }],
      sendGroupSign: ['send_group_sign', { group_id: 'g' }],
      getClientkey: ['get_clientkey', undefined], // no args
      clickInlineKeyboardButton: ['click_inline_keyboard_button', { b: 1 }]
    }

    it('should fallback to callApi when method missing', async () => {
      // Temporarily remove methods from api
      const api: any = mockNapLinkInstance.api
      const backup: any = {}
      for (const k of Object.keys(fallbacks)) {
        backup[k] = api[k]
        api[k] = undefined
      }

      // Test each
      for (const [method, [apiName, args]] of Object.entries(fallbacks)) {
        try {
          // Construct args based on method signature
          // This is a bit hacky, we try to pass reasonable args
          // If method matches key in fallbacks map
          if (method === 'getGroupShutList' || method === 'getGroupNotice' || method === 'sendGroupArkShare' || method === 'setGroupSign' || method === 'sendGroupSign') {
            await (adapter as any)[method]('g')
          } else if (method === 'forwardFriendSingleMsg') {
            await (adapter as any)[method]('u', 'm')
          } else if (method === 'forwardGroupSingleMsg') {
            await (adapter as any)[method]('g', 'm')
          } else if (method === 'getAiCharacters') {
            await (adapter as any)[method]('g') // chatType default 1
          } else if (method === 'getAiRecord' || method === 'sendGroupAiRecord') {
            await (adapter as any)[method]('g', 'c', 't')
          } else if (method === 'getClientkey') {
            await (adapter as any)[method]()
          } else {
            // Params object
            await (adapter as any)[method](args)
          }

          if (args) {
            expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith(apiName, expect.objectContaining(args))
          } else {
            expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith(apiName)
          }
        } catch (e) {
          throw new Error(`Fallback test failed for ${method}: ${e}`)
        }
      }

      // Restore
      Object.assign(api, backup)
    })

    it('should fallback for delGroupNotice', async () => {
      mockNapLinkInstance.api.delGroupNotice = undefined
      await adapter.delGroupNotice('g', '123')
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('_del_group_notice', { group_id: 'g', notice_id: 123 })
      mockNapLinkInstance.api.delGroupNotice = vi.fn()
    })

    it('should fallback for setOnlineStatus', async () => {
      mockNapLinkInstance.api.setOnlineStatus = undefined
      await adapter.setOnlineStatus(1, 2, 3)
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('set_online_status', { status: 1, ext_status: 2, battery_status: 3 })
      mockNapLinkInstance.api.setOnlineStatus = vi.fn()
    })

    it('should fallback for setDiyOnlineStatus', async () => {
      mockNapLinkInstance.api.setDiyOnlineStatus = undefined
      await adapter.setDiyOnlineStatus(1, 'w', 2)
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('set_diy_online_status', { face_id: 1, wording: 'w', face_type: 2 })
      mockNapLinkInstance.api.setDiyOnlineStatus = vi.fn()
    })

    it('should fallback for setGroupRemark', async () => {
      mockNapLinkInstance.api.setGroupRemark = undefined
      await adapter.setGroupRemark('g', 'remark')
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('set_group_remark', { group_id: 'g', remark: 'remark' })
      mockNapLinkInstance.api.setGroupRemark = vi.fn()
    })

    it('should fallback for getGroupInfoEx', async () => {
      mockNapLinkInstance.api.getGroupInfoEx = undefined
      await adapter.getGroupInfoEx('g')
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('get_group_info_ex', { group_id: 'g' })
      mockNapLinkInstance.api.getGroupInfoEx = vi.fn()
    })

    it('should fallback for getGroupDetailInfo', async () => {
      mockNapLinkInstance.api.getGroupDetailInfo = undefined
      await adapter.getGroupDetailInfo('g')
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('get_group_detail_info', { group_id: 'g' })
      mockNapLinkInstance.api.getGroupDetailInfo = vi.fn()
    })

    it('should fallback for getGroupIgnoredNotifies', async () => {
      mockNapLinkInstance.api.getGroupIgnoredNotifies = undefined
      await adapter.getGroupIgnoredNotifies()
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('get_group_ignored_notifies')
      mockNapLinkInstance.api.getGroupIgnoredNotifies = vi.fn()
    })

    it('should fallback for getRkeyEx', async () => {
      mockNapLinkInstance.api.getRkeyEx = undefined
      await adapter.getRkeyEx()
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('get_rkey')
      mockNapLinkInstance.api.getRkeyEx = vi.fn()
    })

    it('should fallback for getRkeyServer', async () => {
      mockNapLinkInstance.api.getRkeyServer = undefined
      await adapter.getRkeyServer()
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('get_rkey_server')
      mockNapLinkInstance.api.getRkeyServer = vi.fn()
    })

    it('should fallback for getRkey', async () => {
      mockNapLinkInstance.api.getRkey = undefined
      await adapter.getRkey()
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('nc_get_rkey')
      mockNapLinkInstance.api.getRkey = vi.fn()
    })

    it('should fallback for setFriendRemark', async () => {
      mockNapLinkInstance.api.setFriendRemark = undefined
      await adapter.setFriendRemark('u', 'remark')
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('set_friend_remark', { user_id: 'u', remark: 'remark' })
      mockNapLinkInstance.api.setFriendRemark = vi.fn()
    })

    it('should fallback for deleteFriend', async () => {
      mockNapLinkInstance.api.deleteFriend = undefined
      await adapter.deleteFriend('u')
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('delete_friend', { user_id: 'u' })
      mockNapLinkInstance.api.deleteFriend = vi.fn()
    })

    it('should fallback for getUnidirectionalFriendList', async () => {
      mockNapLinkInstance.api.getUnidirectionalFriendList = undefined
      await adapter.getUnidirectionalFriendList()
      expect(mockNapLinkInstance.callApi).toHaveBeenCalledWith('get_unidirectional_friend_list')
      mockNapLinkInstance.api.getUnidirectionalFriendList = vi.fn()
    })
  })
})
