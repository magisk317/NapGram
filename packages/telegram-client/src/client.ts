import type { InputPeerLike, User } from '@mtcute/core'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { Message } from '@mtcute/core'
import { Dispatcher } from '@mtcute/dispatcher'
import { HttpProxyTcpTransport, TelegramClient } from '@mtcute/node'
import {
  getTelegramClientDependencies,
  resolveLoggerFactory,
  resolveTelegramEnv,
  resolveTempPath,
} from './deps'
import type { LoggerLike, TelegramClientDependencies, TelegramEnv, TelegramSessionStore } from './deps'

// Define types for handlers
export type MessageHandler = (message: Message) => Promise<boolean | void>

export default class Telegram {
  public readonly client: TelegramClient
  public readonly dispatcher: Dispatcher
  public me?: User
  private logger!: LoggerLike
  private env!: TelegramEnv
  private tempPath!: string

  private static existedBots = {} as { [id: number]: Telegram }

  public get sessionId() {
    return this.session.dbId
  }

  public get isOnline() {
    return this.me !== undefined
  }

  private constructor(
    private session: TelegramSessionStore,
    appName: string,
    deps: TelegramClientDependencies,
    storage?: any,
  ) {
    this.env = resolveTelegramEnv(deps.env)
    const loggerFactory = resolveLoggerFactory(deps.loggerFactory)
    this.logger = loggerFactory('TelegramClient')
    this.tempPath = resolveTempPath(this.env, deps.tempPath)

    const dataDir = this.env.DATA_DIR || '/app/data'
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    const defaultStorage = path.join(dataDir, 'session.db')
    const finalStorage = storage || defaultStorage
    const proxyTransport
      = this.env.PROXY_IP && this.env.PROXY_PORT
        ? new HttpProxyTcpTransport({
          host: this.env.PROXY_IP,
          port: Number(this.env.PROXY_PORT),
          user: this.env.PROXY_USERNAME,
          password: this.env.PROXY_PASSWORD,
        })
        : undefined

    this.client = new TelegramClient({
      apiId: Number(this.env.TG_API_ID),
      apiHash: this.env.TG_API_HASH as string,
      storage: finalStorage,
      ...(proxyTransport ? { transport: proxyTransport } : {}),
      initConnectionOptions: {},
    })
    this.dispatcher = Dispatcher.for(this.client)
  }

  public static async create(startArgs: any, appName = 'NapGram') {
    const deps = getTelegramClientDependencies()
    const session = deps.sessionFactory()
    await session.load()

    const bot = new this(session, appName, deps)

    if (session.sessionString) {
      await bot.client.importSession(session.sessionString, true)
    }

    const env = resolveTelegramEnv(deps.env)
    const botToken = startArgs.botToken ?? startArgs.botAuthToken ?? env.TG_BOT_TOKEN
    bot.logger.info('开始登录 TG Bot')
    try {
      await bot.client.start({
        phone: startArgs.phoneNumber,
        code: startArgs.phoneCode,
        password: startArgs.password,
        botToken,
      })
      bot.logger.info('TG Bot 登录成功')
    }
    catch (err) {
      bot.logger.error('TG Bot 登录失败', err)
      throw err
    }

    const sessionStr = await bot.client.exportSession()
    await session.save(sessionStr)

    if (session.dbId !== undefined) {
      Telegram.existedBots[session.dbId] = bot
    }
    await bot.config()
    return bot
  }

  public static async connect(sessionId: number, appName = 'NapGram', botToken?: string) {
    if (this.existedBots[sessionId]) {
      return this.existedBots[sessionId]
    }
    const deps = getTelegramClientDependencies()
    const session = deps.sessionFactory(sessionId)
    await session.load()

    const bot = new this(session, appName, deps)
    if (session.dbId !== undefined) {
      Telegram.existedBots[session.dbId] = bot
    }

    if (session.sessionString) {
      await bot.client.importSession(session.sessionString, true)
    }

    const env = resolveTelegramEnv(deps.env)
    const effectiveBotToken = botToken ?? env.TG_BOT_TOKEN
    try {
      bot.logger.info('开始登录 TG Bot（已有 session）')
      await bot.client.start({ botToken: effectiveBotToken })
      bot.logger.info('TG Bot 登录成功')
      const sessionStr = await bot.client.exportSession()
      await session.save(sessionStr)
    }
    catch (err) {
      bot.logger.error('TG Bot 登录失败', err)
      throw err
    }
    await bot.config()
    return bot
  }

  private async config() {
    this.me = await this.client.getMe()
    this.dispatcher.onNewMessage(this.onMessage)
    this.dispatcher.onEditMessage(this.onEditedMessage)
    this.dispatcher.onDeleteMessage(this.onDeleteMessage)
  }

  private onMessage = async (msg: Message) => {
    this.logger.debug(`[TG] recv ${msg.id} from ${msg.chat.id}`)
    for (const handler of this.onMessageHandlers) {
      const result = await handler(msg)
      if (result === true) {
        return
      }
    }
  }

  private onEditedMessage = async (msg: Message) => {
    for (const handler of this.onEditedMessageHandlers) {
      await handler(msg)
    }
  }

  private onDeleteMessage = async (update: any) => {
    const ids = update.messageIds || update.messages || []
    this.logger.info(`[TG] message deleted in ${update.channelId || update.chatId}: ${ids.join(', ')}`)
    for (const handler of this.onDeletedMessageHandlers) {
      await handler(update)
    }
  }

  private readonly onMessageHandlers: Array<MessageHandler> = []
  private readonly onEditedMessageHandlers: Array<MessageHandler> = []
  private readonly onDeletedMessageHandlers: Array<(update: any) => Promise<void>> = []

  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler)
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    const index = this.onMessageHandlers.indexOf(handler)
    if (index > -1) {
      this.onMessageHandlers.splice(index, 1)
    }
  }

  public addEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.push(handler)
  }

  public removeEditedMessageEventHandler(handler: MessageHandler) {
    const index = this.onEditedMessageHandlers.indexOf(handler)
    if (index > -1) {
      this.onEditedMessageHandlers.splice(index, 1)
    }
  }

  public addDeletedMessageEventHandler(handler: (update: any) => Promise<void>) {
    this.onDeletedMessageHandlers.push(handler)
  }

  public removeDeletedMessageEventHandler(handler: (update: any) => Promise<void>) {
    const index = this.onDeletedMessageHandlers.indexOf(handler)
    if (index > -1) {
      this.onDeletedMessageHandlers.splice(index, 1)
    }
  }

  public async getChat(chatId: number | string) {
    const { default: TelegramChat } = await import('./chat')
    const chat = await this.client.getChat(chatId)
    return new TelegramChat(this, this.client, chat)
  }

  /**
   * 下载媒体文件
   * @param media 媒体对象或 Message
   * @returns 文件内容的 Buffer
   */
  public async downloadMedia(media: any | Message): Promise<Buffer> {
    let result: Uint8Array
    if (media instanceof Message && media.media) {
      result = await this.client.downloadAsBuffer(media.media as any)
    }
    else {
      result = await this.client.downloadAsBuffer(media)
    }
    return Buffer.from(result)
  }

  private getTempUrl(filename: string) {
    const baseUrl = this.env.INTERNAL_WEB_ENDPOINT || this.env.WEB_ENDPOINT || 'http://napgram-dev:8080'
    return `${baseUrl}/temp/${filename}`
  }

  private sanitizeFilename(name: string) {
    return path
      .basename(name)
      .replace(/[\\/]/g, '_')
      .replace(/[^\w.\-+@() ]/g, '_')
      .trim()
      .slice(0, 200) || `file-${Date.now()}`
  }

  /**
   * 下载媒体文件到本地 temp 目录（避免将整个文件一次性读入内存）。
   * @returns 返回 temp 文件的 URL（默认）或本地路径
   */
  public async downloadMediaToTempFile(
    media: any | Message,
    options?: { prefix?: string, filename?: string, ext?: string, returnType?: 'url' | 'path' },
  ): Promise<string> {
    const prefix = options?.prefix || 'tg'
    const mediaObj = media instanceof Message && (media as any).media ? (media as any).media : media
    const nameFromMedia = typeof (mediaObj as any)?.fileName === 'string' ? (mediaObj as any).fileName : undefined
    const baseName = options?.filename || nameFromMedia
    const rawName = baseName
      ? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${baseName}`
      : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

    const sanitized = this.sanitizeFilename(rawName)
    const ext = options?.ext ? (options.ext.startsWith('.') ? options.ext : `.${options.ext}`) : ''
    const filename = ext && !sanitized.toLowerCase().endsWith(ext.toLowerCase()) ? `${sanitized}${ext}` : sanitized

    await fs.promises.mkdir(this.tempPath, { recursive: true })
    const filePath = path.join(this.tempPath, filename)

    try {
      const location = media instanceof Message && (media as any).media ? (media as any).media : media
      await this.client.downloadToFile(filePath, location as any)
    }
    catch (error) {
      try {
        await fs.promises.rm(filePath, { force: true })
      }
      catch { }
      throw error
    }

    return options?.returnType === 'path' ? filePath : this.getTempUrl(filename)
  }

  /**
   * 下载用户头像
   * @param userId 用户 ID
   * @returns 头像文件的 Buffer，如果没有头像则返回 null
   */
  public async downloadProfilePhoto(userId: InputPeerLike): Promise<Buffer | null> {
    try {
      const chat = await this.client.getChat(userId)
      if (!chat.photo) {
        return null
      }
      const result = await this.client.downloadAsBuffer(chat.photo.big as any)
      return Buffer.from(result)
    }
    catch (error) {
      this.logger.warn(`Failed to download profile photo for ${userId}:`, error)
      return null
    }
  }

  /**
   * 断开与 Telegram 的连接
   */
  public async disconnect() {
    this.logger.info('Disconnecting from Telegram...')
    try {
      await this.client.disconnect()
      this.me = undefined
      this.logger.info('Disconnected successfully')
    }
    catch (error) {
      this.logger.error('Error during disconnect:', error)
      throw error
    }
  }
}
