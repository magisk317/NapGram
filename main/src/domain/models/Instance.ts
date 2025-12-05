import db from './db';
import Telegram from '../../infrastructure/clients/telegram/client';
import { getLogger, type AppLogger } from '../../shared/logger';
import env from './env';
import posthog from './posthog';
import { qqClientFactory, type IQQClient } from '../../infrastructure/clients/qq';
import { FeatureManager } from '../../features';
import ForwardMap from './ForwardMap';

export type WorkMode = 'personal' | 'group' | 'public';


export default class Instance {
  public static readonly instances: Instance[] = [];

  private _owner = 0;
  private _isSetup = false;
  private _workMode = '';
  private _botSessionId = 0;
  private _qq: any;
  private _flags: number;

  private readonly log: AppLogger;

  public tgBot!: Telegram;
  public qqClient?: IQQClient;
  public forwardPairs!: ForwardMap;
  private featureManager?: FeatureManager;
  public isInit = false;

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance - ${this.id}`);
  }

  private async load() {
    const dbEntry = await db.instance.findFirst({
      where: { id: this.id },
      include: { qqBot: true },
    });

    if (!dbEntry) {
      if (this.id === 0) {
        // 创建零号实例
        await db.instance.create({
          data: { id: 0 },
        });
        return;
      }
      else
        throw new Error('Instance not found');
    }

    this._owner = Number(dbEntry.owner);
    this._qq = dbEntry.qqBot;
    this._botSessionId = dbEntry.botSessionId;
    this._isSetup = dbEntry.isSetup;
    this._workMode = dbEntry.workMode;
    this._flags = dbEntry.flags;
  }

  private init(botToken?: string) {
    (async () => {
      this.log.debug('正在登录 TG Bot');
      const token = botToken ?? env.TG_BOT_TOKEN;
      if (this.botSessionId) {
        this.tgBot = await Telegram.connect(this._botSessionId, 'NapGram', token);
      }
      else {
        if (!token) {
          throw new Error('botToken 未指定');
        }
        this.tgBot = await Telegram.create({
          botAuthToken: token,
        });
        this.botSessionId = this.tgBot.sessionId;
      }
      this.log.info('TG Bot 登录完成');

      const wsUrl = this._qq?.wsUrl || env.NAPCAT_WS_URL;
      if (!wsUrl) {
        throw new Error('NapCat WebSocket 地址未配置 (qqBot.wsUrl 或 NAPCAT_WS_URL)');
      }

      this.log.debug('正在初始化 NapCat 客户端');
      this.qqClient = await qqClientFactory.create({
        type: 'napcat',
        wsUrl,
        reconnect: true,
      });
      await this.qqClient.login();
      this.log.info('NapCat 客户端初始化完成');

      // 仅 NapCat 链路，使用轻量转发表
      this.forwardPairs = await ForwardMap.load(this.id);

      // 初始化新架构的功能管理器
      if (this.qqClient) {
        this.log.debug('正在初始化 FeatureManager');
        this.featureManager = new FeatureManager(this, this.tgBot, this.qqClient);
        await this.featureManager.initialize();
        this.log.info('FeatureManager 初始化完成');
      }

      this.isInit = true;
    })()
      .then(() => this.log.info('初始化已完成'))
      .catch((err) => {
        this.log.error('初始化失败', err);
        posthog.capture('初始化失败', { error: err });
      });
  }

  public async login(botToken?: string) {
    await this.load();
    this.init(botToken);
  }

  public static async start(instanceId: number, botToken?: string) {
    const instance = new this(instanceId);
    Instance.instances.push(instance);
    await instance.login(botToken);
    return instance;
  }

  public static async createNew(botToken: string) {
    const dbEntry = await db.instance.create({ data: {} });
    return await this.start(dbEntry.id, botToken);
  }

  get owner() {
    return this._owner;
  }

  get qq() {
    return this._qq;
  }

  get qqUin() {
    return this.qqClient?.uin;
  }

  get isSetup() {
    return this._isSetup;
  }

  get workMode() {
    return this._workMode as WorkMode;
  }

  get botMe() {
    return this.tgBot.me;
  }

  get ownerChat() {
    return undefined;
  }

  get botSessionId() {
    return this._botSessionId;
  }

  get flags() {
    return this._flags;
  }

  set owner(owner: number) {
    this._owner = owner;
    db.instance.update({
      data: { owner },
      where: { id: this.id },
    })
      .then(() => this.log.trace(owner));
  }

  set isSetup(isSetup: boolean) {
    this._isSetup = isSetup;
    db.instance.update({
      data: { isSetup },
      where: { id: this.id },
    })
      .then(() => this.log.trace(isSetup));
  }

  set workMode(workMode: WorkMode) {
    this._workMode = workMode;
    db.instance.update({
      data: { workMode },
      where: { id: this.id },
    })
      .then(() => this.log.trace(workMode));
  }

  set botSessionId(sessionId: number) {
    this._botSessionId = sessionId;
    db.instance.update({
      data: { botSessionId: sessionId },
      where: { id: this.id },
    })
      .then(() => this.log.trace(sessionId));
  }

  set qqBotId(id: number) {
    db.instance.update({
      data: { qqBotId: id },
      where: { id: this.id },
    })
      .then(() => this.log.trace(id));
  }

  set flags(value) {
    this._flags = value;
    db.instance.update({
      data: { flags: value },
      where: { id: this.id },
    })
      .then(() => this.log.trace(value));
  }
}
