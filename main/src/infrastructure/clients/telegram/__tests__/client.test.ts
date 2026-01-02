import { Buffer } from 'node:buffer'
import { Message } from '@mtcute/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TelegramChat from '../chat'
import Telegram from '../client'

const envMock = vi.hoisted(() => ({
  DATA_DIR: '/data',
  TG_API_ID: '1',
  TG_API_HASH: 'hash',
  TG_BOT_TOKEN: 'token',
  PROXY_IP: undefined as string | undefined,
  PROXY_PORT: undefined as number | undefined,
  PROXY_USERNAME: undefined as string | undefined,
  PROXY_PASSWORD: undefined as string | undefined,
  INTERNAL_WEB_ENDPOINT: 'http://internal',
  WEB_ENDPOINT: 'http://web',
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
}))

const fsPromMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const dispatcherMocks = vi.hoisted(() => ({
  onNewMessage: vi.fn(),
  onEditMessage: vi.fn(),
  onDeleteMessage: vi.fn(),
}))

const mtcuteNodeMocks = vi.hoisted(() => ({
  createdOptions: [] as any[],
  transportOptions: [] as any[],
  start: vi.fn().mockResolvedValue(undefined),
  importSession: vi.fn().mockResolvedValue(undefined),
  exportSession: vi.fn().mockResolvedValue('session-export'),
  getMe: vi.fn().mockResolvedValue({ id: 1 }),
  downloadAsBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  downloadToFile: vi.fn().mockResolvedValue(undefined),
  getChat: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
}))

const sessionMocks = vi.hoisted(() => ({
  mockSessionString: undefined as string | undefined,
  load: vi.fn(),
  save: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    mkdirSync: fsMocks.mkdirSync,
    createWriteStream: fsMocks.createWriteStream,
    promises: {
      mkdir: fsPromMocks.mkdir,
      rm: fsPromMocks.rm,
    },
  },
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  createWriteStream: fsMocks.createWriteStream,
  promises: {
    mkdir: fsPromMocks.mkdir,
    rm: fsPromMocks.rm,
  },
}))

vi.mock('node:fs/promises', () => ({
  mkdir: fsPromMocks.mkdir,
  rm: fsPromMocks.rm,
}))

vi.mock('../../../../domain/models/env', () => ({
  default: envMock,
}))

vi.mock('../../../../shared/logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../../../../shared/utils/temp', () => ({
  TEMP_PATH: '/tmp/napgram-temp',
}))

const coreMocks = vi.hoisted(() => ({
  Message: class MessageMock {
    media?: any
    chat: any
    id!: number
    constructor(props: any = {}) {
      Object.assign(this, props)
    }
  },
}))

const nodeClasses = vi.hoisted(() => ({
  TelegramClientMock: class TelegramClientMock {
    options: any
    constructor(options: any) {
      this.options = options
      mtcuteNodeMocks.createdOptions.push(options)
    }

    start = (...args: any[]) => mtcuteNodeMocks.start(...args)
    importSession = (...args: any[]) => mtcuteNodeMocks.importSession(...args)
    exportSession = (...args: any[]) => mtcuteNodeMocks.exportSession(...args)
    getMe = (...args: any[]) => mtcuteNodeMocks.getMe(...args)
    downloadAsBuffer = (...args: any[]) => mtcuteNodeMocks.downloadAsBuffer(...args)
    downloadToFile = (...args: any[]) => mtcuteNodeMocks.downloadToFile(...args)
    getChat = (...args: any[]) => mtcuteNodeMocks.getChat(...args)
    disconnect = (...args: any[]) => mtcuteNodeMocks.disconnect(...args)
  },
  HttpProxyTcpTransportMock: class HttpProxyTcpTransportMock {
    options: any
    constructor(options: any) {
      this.options = options
      mtcuteNodeMocks.transportOptions.push(options)
    }
  },
}))

const sessionClass = vi.hoisted(() => ({
  TelegramSessionMock: class TelegramSessionMock {
    dbId?: number
    sessionString?: string
    constructor(id?: number) {
      this.dbId = id
    }

    async load() {
      sessionMocks.load()
      if (!this.dbId) {
        this.dbId = 1
      }
      this.sessionString = sessionMocks.mockSessionString
    }

    async save(session: string) {
      sessionMocks.save(session)
      this.sessionString = session
    }
  },
}))

vi.mock('@mtcute/dispatcher', () => ({
  Dispatcher: {
    for: vi.fn(() => dispatcherMocks),
  },
}))

vi.mock('@mtcute/core', () => ({
  Message: coreMocks.Message,
}))

vi.mock('@mtcute/node', () => ({
  TelegramClient: nodeClasses.TelegramClientMock,
  HttpProxyTcpTransport: nodeClasses.HttpProxyTcpTransportMock,
}))

vi.mock('../../../../domain/models/TelegramSession', () => ({
  default: sessionClass.TelegramSessionMock,
}))

describe('telegram client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mtcuteNodeMocks.createdOptions.length = 0
    mtcuteNodeMocks.transportOptions.length = 0
    sessionMocks.mockSessionString = undefined
    envMock.PROXY_IP = undefined
    envMock.PROXY_PORT = undefined
    fsMocks.existsSync.mockReturnValue(true)
    ; (Telegram as any).existedBots = {}
  })

  it('creates a new bot and imports session', async () => {
    sessionMocks.mockSessionString = 'stored'
    const bot = await Telegram.create({
      botToken: 'bot',
      phoneNumber: '1',
      phoneCode: '2',
      password: 'pw',
    })

    expect(sessionMocks.load).toHaveBeenCalled()
    expect(mtcuteNodeMocks.importSession).toHaveBeenCalledWith('stored', true)
    expect(mtcuteNodeMocks.start).toHaveBeenCalledWith({
      phone: '1',
      code: '2',
      password: 'pw',
      botToken: 'bot',
    })
    expect(sessionMocks.save).toHaveBeenCalledWith('session-export')
    expect(dispatcherMocks.onNewMessage).toHaveBeenCalledWith(expect.any(Function))
    expect(bot.me).toEqual({ id: 1 })
  })

  it('connects existing session and reuses cached bot', async () => {
    const cached = { cached: true }
      ; (Telegram as any).existedBots = { 5: cached }

    const result = await Telegram.connect(5, 'NapGram')

    expect(result).toBe(cached)
    expect(sessionMocks.load).not.toHaveBeenCalled()
  })

  it('connects with bot token when no session string', async () => {
    const bot = await Telegram.connect(2, 'NapGram', 'token2')

    expect(mtcuteNodeMocks.importSession).not.toHaveBeenCalled()
    expect(mtcuteNodeMocks.start).toHaveBeenCalledWith({ botToken: 'token2' })
    expect(bot.sessionId).toBe(2)
  })

  it('reports online status based on me', async () => {
    const bot = await Telegram.connect(10, 'NapGram')

    expect(bot.isOnline).toBe(true)
    bot.me = undefined
    expect(bot.isOnline).toBe(false)
  })

  it('creates data dir when missing', async () => {
    fsMocks.existsSync.mockReturnValueOnce(false)

    await Telegram.create({ botToken: 'bot' })

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/data', { recursive: true })
  })

  it('rethrows when create login fails', async () => {
    mtcuteNodeMocks.start.mockRejectedValueOnce(new Error('login fail'))

    await expect(Telegram.create({ botToken: 'bot' })).rejects.toThrow('login fail')
  })

  it('imports session when connecting with session string', async () => {
    sessionMocks.mockSessionString = 'stored'

    await Telegram.connect(11, 'NapGram')

    expect(mtcuteNodeMocks.importSession).toHaveBeenCalledWith('stored', true)
  })

  it('rethrows when connect login fails', async () => {
    mtcuteNodeMocks.start.mockRejectedValueOnce(new Error('connect fail'))

    await expect(Telegram.connect(12, 'NapGram')).rejects.toThrow('connect fail')
  })

  it('initializes proxy transport when configured', async () => {
    envMock.PROXY_IP = '127.0.0.1'
    envMock.PROXY_PORT = 8080
    envMock.PROXY_USERNAME = 'user'
    envMock.PROXY_PASSWORD = 'pass'

    await Telegram.create({ botToken: 'bot' })

    expect(mtcuteNodeMocks.transportOptions[0]).toEqual({
      host: '127.0.0.1',
      port: 8080,
      user: 'user',
      password: 'pass',
    })
    expect(mtcuteNodeMocks.createdOptions[0].transport).toBeDefined()
  })

  it('downloads media buffer from message or object', async () => {
    const bot = await Telegram.connect(3, 'NapGram')
    const msg = new Message({ media: { id: 'm' }, chat: { id: 1 }, id: 1 } as any, bot as any)

    const bufferFromMessage = await bot.downloadMedia(msg)
    const bufferFromObject = await bot.downloadMedia({ id: 'x' })

    expect(bufferFromMessage).toBeInstanceOf(Buffer)
    expect(bufferFromObject).toBeInstanceOf(Buffer)
    expect(mtcuteNodeMocks.downloadAsBuffer).toHaveBeenCalledWith(msg.media)
    expect(mtcuteNodeMocks.downloadAsBuffer).toHaveBeenCalledWith({ id: 'x' })
  })

  it('downloads media to temp file and returns url or path', async () => {
    const bot = await Telegram.connect(4, 'NapGram')
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const url = await bot.downloadMediaToTempFile(
      { fileName: 'bad/fi?le.txt' },
      { prefix: 'tg', ext: 'png' },
    )
    const filePath = await bot.downloadMediaToTempFile(
      { fileName: 'name.txt' },
      { prefix: 'tg', returnType: 'path' },
    )

    expect(fsPromMocks.mkdir).toHaveBeenCalledWith('/tmp/napgram-temp', { recursive: true })
    expect(mtcuteNodeMocks.downloadToFile).toHaveBeenCalled()
    expect(url).toContain('http://internal/temp/')
    expect(filePath).toContain('/tmp/napgram-temp/')
  })

  it('cleans up when download to temp fails', async () => {
    const bot = await Telegram.connect(6, 'NapGram')
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    mtcuteNodeMocks.downloadToFile.mockRejectedValueOnce(new Error('fail'))

    await expect(bot.downloadMediaToTempFile({ fileName: 'file.txt' })).rejects.toThrow('fail')

    expect(fsPromMocks.rm).toHaveBeenCalledWith(expect.stringContaining('/tmp/napgram-temp/'), { force: true })
  })

  it('wraps getChat with TelegramChat', async () => {
    const bot = await Telegram.connect(7, 'NapGram')
    const chatObj = { id: 123 }
    mtcuteNodeMocks.getChat.mockResolvedValueOnce(chatObj)

    const chat = await bot.getChat(123)

    expect(chat).toBeInstanceOf(TelegramChat)
    expect(chat.chat).toBe(chatObj)
  })

  it('downloads profile photo or returns null', async () => {
    const bot = await Telegram.connect(8, 'NapGram')
    mtcuteNodeMocks.getChat.mockResolvedValueOnce({ photo: null })

    const none = await bot.downloadProfilePhoto(1)

    mtcuteNodeMocks.getChat.mockResolvedValueOnce({ photo: { big: 'big' } })
    const buffer = await bot.downloadProfilePhoto(1)

    expect(none).toBeNull()
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('returns null when profile photo download fails', async () => {
    const bot = await Telegram.connect(12, 'NapGram')
    mtcuteNodeMocks.getChat.mockRejectedValueOnce(new Error('chat error'))

    await expect(bot.downloadProfilePhoto(1)).resolves.toBeNull()
  })

  it('dispatches new message handlers until handled', async () => {
    const bot = await Telegram.connect(13, 'NapGram')
    const handler1 = vi.fn().mockResolvedValue(true)
    const handler2 = vi.fn().mockResolvedValue(undefined)

    bot.addNewMessageEventHandler(handler1)
    bot.addNewMessageEventHandler(handler2)

    await (bot as any).onMessage(new Message({ id: 1, chat: { id: 1 } } as any, bot as any))

    expect(handler1).toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })

  it('removes new message handlers', async () => {
    const bot = await Telegram.connect(14, 'NapGram')
    const handler = vi.fn().mockResolvedValue(undefined)

    bot.addNewMessageEventHandler(handler)
    bot.removeNewMessageEventHandler(handler)

    await (bot as any).onMessage(new Message({ id: 2, chat: { id: 2 } } as any, bot as any))

    expect(handler).not.toHaveBeenCalled()
  })

  it('dispatches edited message handlers and supports removal', async () => {
    const bot = await Telegram.connect(15, 'NapGram')
    const handler = vi.fn().mockResolvedValue(undefined)

    bot.addEditedMessageEventHandler(handler)
    await (bot as any).onEditedMessage(new Message({ id: 3, chat: { id: 3 } } as any, bot as any))
    bot.removeEditedMessageEventHandler(handler)
    await (bot as any).onEditedMessage(new Message({ id: 4, chat: { id: 4 } } as any, bot as any))

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches deleted message handlers and supports removal', async () => {
    const bot = await Telegram.connect(16, 'NapGram')
    const handler = vi.fn().mockResolvedValue(undefined)

    bot.addDeletedMessageEventHandler(handler)
    await (bot as any).onDeleteMessage({ channelId: 1, messageIds: [1, 2] })
    bot.removeDeletedMessageEventHandler(handler)
    await (bot as any).onDeleteMessage({ chatId: 2, messages: [3] })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('disconnects client and clears me', async () => {
    const bot = await Telegram.connect(9, 'NapGram')
    bot.me = { id: 1 } as any

    await bot.disconnect()

    expect(mtcuteNodeMocks.disconnect).toHaveBeenCalled()
    expect(bot.me).toBeUndefined()
  })

  it('rethrows when disconnect fails', async () => {
    const bot = await Telegram.connect(17, 'NapGram')
    mtcuteNodeMocks.disconnect.mockRejectedValueOnce(new Error('disconnect fail'))

    await expect(bot.disconnect()).rejects.toThrow('disconnect fail')
  })

  it('covers edge cases in downloadMediaToTempFile (lines 251-265)', async () => {
    const bot = await Telegram.connect(18, 'NapGram')

    // Case: media is Message with media
    const msg = new Message({ media: { id: 'm', fileName: 'msg.png' } } as any, bot as any)
    const path1 = await bot.downloadMediaToTempFile(msg, { returnType: 'path' })
    expect(path1).toContain('msg.png')

    // Case: options.ext without dot
    const url1 = await bot.downloadMediaToTempFile({ id: 'x' }, { ext: 'jpg' })
    expect(url1).toContain('.jpg')

    // Case: media is object with fileName
    const url2 = await bot.downloadMediaToTempFile({ fileName: 'obj.txt' })
    expect(url2).toContain('obj.txt')
  })
})
