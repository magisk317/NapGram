import type { CommandsFeature, ForwardFeature, MediaFeature, RecallFeature } from '@napgram/feature-kit'
import type { IQQClient } from '../../infrastructure/clients/qq'
import type Telegram from '../../infrastructure/clients/telegram/client'
import type { AppLogger } from '@napgram/infra-kit'
import { FeatureManager } from '../../features/FeatureManager'
import { qqClientFactory } from '../../infrastructure/clients/qq'
import { telegramClientFactory } from '../../infrastructure/clients/telegram'
import { getEventPublisher } from '@napgram/plugin-kit'
import { db, env, getLogger, ForwardMap, sentry, schema, eq } from '@napgram/infra-kit'

import { InstanceRegistry } from '@napgram/runtime-kit'

export type WorkMode = 'personal' | 'group' | 'public'

export default class Instance {

  private _owner = 0
  private _isSetup = false
  private _workMode = ''
  private _botSessionId = 0
  private _qq: any
  private _flags = 0

  private readonly log: AppLogger

  public tgBot!: Telegram
  public qqClient?: IQQClient
  public forwardPairs!: ForwardMap
  public mediaFeature?: MediaFeature
  public recallFeature?: RecallFeature
  public commandsFeature?: CommandsFeature
  public forwardFeature?: ForwardFeature
  private featureManager?: FeatureManager
  public isInit = false
  private initPromise?: Promise<void>
  public eventPublisher?: { publishMessageCreated: (...args: any[]) => Promise<void> }

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance - ${this.id}`)
  }

  private async load() {
    const dbEntry = await db.query.instance.findFirst({
      where: eq(schema.instance.id, this.id),
      with: { qqBot: true },
    })

    if (!dbEntry) {
      if (this.id === 0) {
        // 创建零号实例
        await db.insert(schema.instance).values({ id: 0 })
        return
      }
      else {
        throw new Error('Instance not found')
      }
    }

    this._owner = Number(dbEntry.owner)
    this._qq = dbEntry.qqBot
    this._botSessionId = dbEntry.botSessionId ?? 0
    this._isSetup = dbEntry.isSetup
    this._workMode = dbEntry.workMode
    this._flags = dbEntry.flags
  }

  private async init(botToken?: string) {
    if (this.initPromise)
      return this.initPromise

    this.initPromise = (async () => {
      this.log.debug('TG Bot 正在登录')
      const token = botToken ?? env.TG_BOT_TOKEN
      if (this.botSessionId) {
        this.tgBot = await telegramClientFactory.connect({
          type: 'mtcute',
          sessionId: this._botSessionId,
          botToken: token,
          appName: 'NapGram',
        })
      }
      else {
        if (!token) {
          throw new Error('botToken 未指定')
        }
        this.tgBot = await telegramClientFactory.create({
          type: 'mtcute',
          botToken: token,
          appName: 'NapGram',
        })
        this.botSessionId = this.tgBot.sessionId ?? 0
      }
      this.log.info('TG Bot ✓ 登录完成')

      const wsUrl = this._qq?.wsUrl || env.NAPCAT_WS_URL
      if (!wsUrl) {
        throw new Error('NapCat WebSocket 地址未配置 (qqBot.wsUrl 或 NAPCAT_WS_URL)')
      }

      this.log.debug('NapCat 客户端 正在初始化')
      this.qqClient = await qqClientFactory.create({
        type: 'napcat',
        wsUrl,
        reconnect: true,
      })
      await this.qqClient.login()
      this.log.info('NapCat 客户端 ✓ 初始化完成')

      // 仅 NapCat 链路，使用轻量转发表
      this.forwardPairs = await ForwardMap.load(this.id)

      // 插件系统：桥接 QQ 侧事件到插件 EventBus
      try {
        const eventPublisher = getEventPublisher()
        eventPublisher.publishInstanceStatus({ instanceId: this.id, status: 'starting' })
        const instanceId = this.id
        const qqClient = this.qqClient;

        (qqClient as any).on('request.friend', async (e: any) => {
          const requestId = String(e?.flag ?? '')
          if (!requestId)
            return
          const userId = String(e?.userId ?? '')
          const userName = String(e?.userName || userId || 'Unknown')
          eventPublisher.publishFriendRequest({
            instanceId,
            platform: 'qq',
            requestId,
            userId,
            userName,
            comment: typeof e?.comment === 'string' ? e.comment : undefined,
            timestamp: typeof e?.timestamp === 'number' ? e.timestamp : Date.now(),
            approve: async () => {
              if (typeof (qqClient as any).handleFriendRequest !== 'function') {
                throw new TypeError('QQ client does not support handleFriendRequest()')
              }
              await (qqClient as any).handleFriendRequest(requestId, true)
            },
            reject: async (reason?: string) => {
              if (typeof (qqClient as any).handleFriendRequest !== 'function') {
                throw new TypeError('QQ client does not support handleFriendRequest()')
              }
              await (qqClient as any).handleFriendRequest(requestId, false, reason)
            },
          })
        });

        (qqClient as any).on('request.group', async (e: any) => {
          const requestId = String(e?.flag ?? '')
          if (!requestId)
            return
          const groupId = String(e?.groupId ?? '')
          const userId = String(e?.userId ?? '')
          const userName = String(e?.userName || userId || 'Unknown')
          const subType = (e?.subType === 'invite' ? 'invite' : 'add') as 'add' | 'invite'
          eventPublisher.publishGroupRequest({
            instanceId,
            platform: 'qq',
            requestId,
            groupId,
            userId,
            userName,
            comment: typeof e?.comment === 'string' ? e.comment : undefined,
            subType,
            timestamp: typeof e?.timestamp === 'number' ? e.timestamp : Date.now(),
            approve: async () => {
              if (typeof (qqClient as any).handleGroupRequest !== 'function') {
                throw new TypeError('QQ client does not support handleGroupRequest()')
              }
              await (qqClient as any).handleGroupRequest(requestId, subType, true)
            },
            reject: async (reason?: string) => {
              if (typeof (qqClient as any).handleGroupRequest !== 'function') {
                throw new TypeError('QQ client does not support handleGroupRequest()')
              }
              await (qqClient as any).handleGroupRequest(requestId, subType, false, reason)
            },
          })
        })

        qqClient.on('group.increase', (groupId: string, member: any) => {
          eventPublisher.publishNotice({
            instanceId,
            platform: 'qq',
            noticeType: 'group-member-increase',
            groupId: String(groupId),
            userId: String(member?.id ?? ''),
            timestamp: Date.now(),
            raw: { groupId, member },
          })
        })

        qqClient.on('group.decrease', (groupId: string, uin: string) => {
          eventPublisher.publishNotice({
            instanceId,
            platform: 'qq',
            noticeType: 'group-member-decrease',
            groupId: String(groupId),
            userId: String(uin),
            timestamp: Date.now(),
            raw: { groupId, uin },
          })
        })

        qqClient.on('friend.increase', (friend: any) => {
          eventPublisher.publishNotice({
            instanceId,
            platform: 'qq',
            noticeType: 'friend-add',
            userId: String(friend?.id ?? ''),
            timestamp: Date.now(),
            raw: friend,
          })
        })

        qqClient.on('recall', (evt: any) => {
          const chatId = String(evt?.chatId ?? '')
          const operatorId = String(evt?.operatorId ?? '')
          const noticeType = chatId && operatorId && chatId === operatorId ? 'friend-recall' : 'group-recall'
          eventPublisher.publishNotice({
            instanceId,
            platform: 'qq',
            noticeType,
            groupId: noticeType === 'group-recall' ? chatId : undefined,
            userId: noticeType === 'friend-recall' ? chatId : undefined,
            operatorId: operatorId || undefined,
            timestamp: typeof evt?.timestamp === 'number' ? evt.timestamp : Date.now(),
            raw: evt,
          })
        })

        qqClient.on('poke', (chatId: string, operatorId: string, targetId: string) => {
          eventPublisher.publishNotice({
            instanceId,
            platform: 'qq',
            noticeType: 'other',
            groupId: String(chatId),
            userId: String(targetId),
            operatorId: String(operatorId),
            timestamp: Date.now(),
            raw: { type: 'poke', chatId, operatorId, targetId },
          })
        })
      }
      catch (error) {
        this.log.warn('Plugin event bridge init failed:', error)
      }



      // 初始化新架构的功能管理器
      // if (this.qqClient) { // Redundant check, login() succeeded above
      this.log.debug('FeatureManager 正在初始化')
      this.featureManager = new FeatureManager(this, this.tgBot, this.qqClient)
      await this.featureManager.initialize()
      this.log.info('FeatureManager ✓ 初始化完成')
      try {
        getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'running' })
      }
      catch (error) {
        this.log.warn('Failed to publish instance running status:', error)
      }

      // 监听掉线/恢复事件，交给插件侧处理通知
      this.qqClient.on('offline', async () => {
        this.log.warn('NapCat connection offline (disconnect)')
        this.isSetup = false
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-lost',
            timestamp: Date.now(),
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-lost notice:', error)
        }
      })

      this.qqClient.on('online', async () => {
        this.log.info('NapCat connection online (connect)')
        this.isSetup = true
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-restored',
            timestamp: Date.now(),
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-restored notice:', error)
        }
      })

      // SDK 级别的永久连接丢失/恢复事件
      this.qqClient.on('connection:lost', async (event: any) => {
        this.log.warn('NapCat connection lost:', event)
        this.isSetup = false
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-lost',
            timestamp: typeof event?.timestamp === 'number' ? event.timestamp : Date.now(),
            raw: event,
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-lost notice:', error)
        }
      })

      this.qqClient.on('connection:restored', async (event: any) => {
        this.log.info('NapCat connection restored:', event)
        this.isSetup = true
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-restored',
            timestamp: typeof event?.timestamp === 'number' ? event.timestamp : Date.now(),
            raw: event,
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-restored notice:', error)
        }
      })
      // }

      this.isSetup = true
      this.isInit = true
    })()

    this.initPromise
      .then(() => this.log.info('Instance ✓ 初始化完成'))
      .catch((err) => {
        this.log.error('初始化失败', err)
        sentry.captureException(err, { stage: 'instance-init', instanceId: this.id })
      })

    return this.initPromise
  }

  public async login(botToken?: string) {
    await this.load()
    await this.init(botToken)
  }

  public static async start(instanceId: number, botToken?: string) {
    const instance = new this(instanceId)
    InstanceRegistry.add(instance as any)
    await instance.login(botToken)
    return instance
  }

  public static async createNew(botToken: string) {
    const entries = await db.insert(schema.instance).values({}).returning({ id: schema.instance.id })
    const dbEntry = entries[0]
    if (!dbEntry) {
      throw new Error('Failed to create instance')
    }
    return await this.start(dbEntry.id, botToken)
  }

  get owner() {
    return this._owner
  }

  get qq() {
    return this._qq
  }

  get qqUin() {
    return this.qqClient?.uin
  }

  get isSetup() {
    return this._isSetup
  }

  get workMode() {
    return this._workMode as WorkMode
  }

  get botMe() {
    return this.tgBot.me
  }

  get ownerChat() {
    return undefined
  }

  get botSessionId() {
    return this._botSessionId
  }

  get flags() {
    return this._flags
  }

  set owner(owner: number) {
    this._owner = owner
    db.update(schema.instance)
      .set({ owner: BigInt(owner) })
      .where(eq(schema.instance.id, this.id))
      .then(() => this.log.trace(owner))
  }

  set isSetup(isSetup: boolean) {
    this._isSetup = isSetup
    db.update(schema.instance)
      .set({ isSetup })
      .where(eq(schema.instance.id, this.id))
      .then(() => this.log.trace(isSetup))
  }

  set workMode(workMode: WorkMode) {
    this._workMode = workMode
    db.update(schema.instance)
      .set({ workMode })
      .where(eq(schema.instance.id, this.id))
      .then(() => this.log.trace(workMode))
  }

  set botSessionId(sessionId: number) {
    this._botSessionId = sessionId
    db.update(schema.instance)
      .set({ botSessionId: sessionId })
      .where(eq(schema.instance.id, this.id))
      .then(() => this.log.trace(sessionId))
  }

  set qqBotId(id: number) {
    if (this._qq)
      this._qq.id = id
    db.update(schema.instance)
      .set({ qqBotId: id })
      .where(eq(schema.instance.id, this.id))
      .then(() => this.log.trace(id))
  }

  get qqBotId() {
    return this._qq?.id
  }

  set flags(value) {
    this._flags = value
    db.update(schema.instance)
      .set({ flags: value })
      .where(eq(schema.instance.id, this.id))
      .then(() => this.log.trace(value))
  }
}
