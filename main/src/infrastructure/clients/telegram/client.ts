import { TelegramClient, HttpProxyTcpTransport } from '@mtcute/node';
import { Dispatcher } from '@mtcute/dispatcher';
import { User, Message, InputPeerLike } from '@mtcute/core';
import TelegramSession from '../../../domain/models/TelegramSession';
import env from '../../../domain/models/env';
import { getLogger } from '../../../shared/logger';
import os from 'os';
import fs from 'fs';
import path from 'path';

// Define types for handlers
type MessageHandler = (message: Message) => Promise<boolean | void>;

export default class Telegram {
  public readonly client: TelegramClient;
  public readonly dispatcher: Dispatcher;
  public me?: User;
  private logger = getLogger('TelegramClient');

  private static existedBots = {} as { [id: number]: Telegram };

  public get sessionId() {
    return this.session.dbId;
  }

  public get isOnline() {
    // mtcute 的 client 连接状态可以通过检查是否已启动来判断
    // 更准确的方式是检查 client 的内部状态，但 mtcute 没有直接暴露
    return this.me !== undefined;
  }

  private constructor(private session: TelegramSession, appName: string, storage?: any) {
    const dataDir = env.DATA_DIR || '/app/data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const defaultStorage = path.join(dataDir, 'session.db');
    const finalStorage = storage || defaultStorage;
    const proxyTransport =
      env.PROXY_IP && env.PROXY_PORT
        ? new HttpProxyTcpTransport({
          host: env.PROXY_IP,
          port: env.PROXY_PORT,
          user: env.PROXY_USERNAME,
          password: env.PROXY_PASSWORD,
        })
        : undefined;

    this.client = new TelegramClient({
      apiId: Number(env.TG_API_ID),
      apiHash: env.TG_API_HASH,
      storage: finalStorage,
      ...(proxyTransport ? { transport: proxyTransport } : {}),
      // deviceModel: `${appName} On ${os.hostname()}`,
      // appVersion: 'sleepyfox',
      // langCode: 'zh',
      // systemVersion: os.release(),
      initConnectionOptions: {
        // useIpv6: !!env.IPV6, // mtcute handles this differently or via transport
      },
      // transport: () => undefined // Use default transport
    });
    this.dispatcher = Dispatcher.for(this.client);
  }

  public static async create(startArgs: any, appName = 'NapGram') {
    const session = new TelegramSession();
    await session.load();

    // Use specific storage path for new sessions to avoid permission issues
    const bot = new this(session, appName);

    // If we already have a stored session string, import it into sqlite storage
    if (session.sessionString) {
      await bot.client.importSession(session.sessionString, true);
    }

    const botToken = startArgs.botToken ?? startArgs.botAuthToken ?? env.TG_BOT_TOKEN;
    bot.logger.info('开始登录 TG Bot');
    try {
      await bot.client.start({
        phone: startArgs.phoneNumber,
        code: startArgs.phoneCode,
        password: startArgs.password,
        botToken,
      });
      bot.logger.info('TG Bot 登录成功');
    }
    catch (err) {
      bot.logger.error('TG Bot 登录失败', err);
      throw err;
    }

    const sessionStr = await bot.client.exportSession();
    await session.save(sessionStr);

    Telegram.existedBots[session.dbId!] = bot;
    await bot.config();
    return bot;
  }

  public static async connect(sessionId: number, appName = 'NapGram', botToken?: string) {
    if (this.existedBots[sessionId]) {
      return this.existedBots[sessionId];
    }
    const session = new TelegramSession(sessionId);
    await session.load();

    const bot = new this(session, appName);
    Telegram.existedBots[sessionId] = bot;

    if (session.sessionString) {
      await bot.client.importSession(session.sessionString, true);
    }

    // 当数据库里没有有效 session 时，用 botToken 重新登录
    const effectiveBotToken = botToken ?? env.TG_BOT_TOKEN;
    try {
      bot.logger.info('开始登录 TG Bot（已有 session）');
      await bot.client.start({ botToken: effectiveBotToken });
      bot.logger.info('TG Bot 登录成功');
      const sessionStr = await bot.client.exportSession();
      await session.save(sessionStr);
    } catch (err) {
      bot.logger.error('TG Bot 登录失败', err);
      throw err;
    }
    await bot.config();
    return bot;
  }

  private async config() {
    this.me = await this.client.getMe();

    this.dispatcher.onNewMessage(this.onMessage);
    this.dispatcher.onEditMessage(this.onEditedMessage);
  }

  private onMessage = async (msg: Message) => {
    this.logger.info(`[TG] recv ${msg.id} from ${msg.chat.id}`);
    for (const handler of this.onMessageHandlers) {
      await handler(msg);
    }
  };

  private onEditedMessage = async (msg: Message) => {
    for (const handler of this.onEditedMessageHandlers) {
      await handler(msg);
    }
  };

  private readonly onMessageHandlers: Array<MessageHandler> = [];
  private readonly onEditedMessageHandlers: Array<MessageHandler> = [];

  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler);
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    const index = this.onMessageHandlers.indexOf(handler);
    if (index > -1) {
      this.onMessageHandlers.splice(index, 1);
    }
  }

  public addEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.push(handler);
  }

  public removeEditedMessageEventHandler(handler: MessageHandler) {
    const index = this.onEditedMessageHandlers.indexOf(handler);
    if (index > -1) {
      this.onEditedMessageHandlers.splice(index, 1);
    }
  }

  public async getChat(chatId: number | string) {
    const { default: TelegramChat } = await import('./chat');
    const chat = await this.client.getChat(chatId);
    return new TelegramChat(this, this.client, chat);
  }

  /**
   * 下载媒体文件
   * @param media 媒体对象或 Message
   * @returns 文件内容的 Buffer
   */
  public async downloadMedia(media: any | Message): Promise<Buffer> {
    // mtcute 使用 downloadAsBuffer 方法下载媒体
    let result: Uint8Array;
    if (media instanceof Message && media.media) {
      result = await this.client.downloadAsBuffer(media.media as any);
    } else {
      result = await this.client.downloadAsBuffer(media);
    }
    // 将 Uint8Array 转换为 Buffer
    return Buffer.from(result);
  }

  /**
   * 下载用户头像
   * @param userId 用户 ID
   * @returns 头像文件的 Buffer，如果没有头像则返回 null
   */
  public async downloadProfilePhoto(userId: InputPeerLike): Promise<Buffer | null> {
    try {
      // 获取用户信息
      const chat = await this.client.getChat(userId);
      if (!chat.photo) {
        return null;
      }
      // 下载头像
      const result = await this.client.downloadAsBuffer(chat.photo.big as any);
      return Buffer.from(result);
    } catch (error) {
      this.logger.warn(`Failed to download profile photo for ${userId}:`, error);
      return null;
    }
  }

  /**
   * 断开与 Telegram 的连接
   */
  public async disconnect() {
    this.logger.info('Disconnecting from Telegram...');
    try {
      await this.client.disconnect();
      this.me = undefined;
      this.logger.info('Disconnected successfully');
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
      throw error;
    }
  }
}
