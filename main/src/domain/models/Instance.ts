import db from './db';
import Telegram from '../../infrastructure/clients/telegram/client';
import { getLogger, type AppLogger } from '../../shared/logger';
import env from './env';
import posthog from './posthog';
import { qqClientFactory, type IQQClient } from '../../infrastructure/clients/qq';
import { FeatureManager } from '../../features';
import ForwardMap from './ForwardMap';
import { GatewayRuntime, type GatewayServer, type EventPublisher, type ActionExecutor } from '../../gateway';

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

  // Gateway 组件
  public gatewayServer?: GatewayServer;
  public eventPublisher?: EventPublisher;
  public actionExecutor?: ActionExecutor;

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
      this.log.debug('TG Bot 正在登录');
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
      this.log.info('TG Bot ✓ 登录完成');

      const wsUrl = this._qq?.wsUrl || env.NAPCAT_WS_URL;
      if (!wsUrl) {
        throw new Error('NapCat WebSocket 地址未配置 (qqBot.wsUrl 或 NAPCAT_WS_URL)');
      }

      this.log.debug('NapCat 客户端 正在初始化');
      this.qqClient = await qqClientFactory.create({
        type: 'napcat',
        wsUrl,
        reconnect: true,
      });
      await this.qqClient.login();
      this.log.info('NapCat 客户端 ✓ 初始化完成');

      // 仅 NapCat 链路，使用轻量转发表
      this.forwardPairs = await ForwardMap.load(this.id);

      // 初始化新架构的功能管理器
      if (this.qqClient) {
        this.log.debug('FeatureManager 正在初始化');
        this.featureManager = new FeatureManager(this, this.tgBot, this.qqClient);
        await this.featureManager.initialize();
        this.log.info('FeatureManager ✓ 初始化完成');

        // 初始化掉线通知服务
        if (env.ENABLE_OFFLINE_NOTIFICATION) {
          const { NotificationService } = await import('../../shared/services/NotificationService');
          this.log.info('Offline notification service 正在初始化');
          const notificationService = new NotificationService(env.OFFLINE_NOTIFICATION_COOLDOWN);

          // 监听掉线事件
          this.qqClient.on('connection:lost', async (event: any) => {
            this.log.warn('NapCat connection lost:', event);
            try {
              await notificationService.notifyDisconnection(
                this.qqClient,
                this.tgBot,
                env.ADMIN_QQ,
                env.ADMIN_TG
              );
            } catch (error) {
              this.log.error(error, 'Failed to send disconnection notification:');
            }
          });

          // 监听重连成功事件
          this.qqClient.on('connection:restored', async (event: any) => {
            this.log.info('NapCat connection restored:', event);
            try {
              await notificationService.notifyReconnection(
                this.qqClient,
                this.tgBot,
                env.ADMIN_QQ,
                env.ADMIN_TG
              );
            } catch (error) {
              this.log.error(error, 'Failed to send reconnection notification:');
            }
          });

          this.log.info('Offline notification service ✓ 初始化完成');
        }

        // 初始化 Gateway（全局单例，按实例注册执行器）
        this.log.debug('Gateway 正在初始化');
        try {
          const { server, publisher, executor } = GatewayRuntime.registerInstance(this.id, this.qqClient, this.tgBot);
          this.gatewayServer = server;
          this.eventPublisher = publisher;
          this.actionExecutor = executor;
          this.log.info('Gateway ✓ 初始化完成');
        } catch (error) {
          this.log.error('Gateway initialization failed', error);
          // Gateway 失败不应阻止实例启动
        }
      }

      this.isInit = true;
    })()
      .then(() => this.log.info('Instance ✓ 初始化完成'))
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
