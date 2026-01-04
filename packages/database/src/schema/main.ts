import { pgTable, serial, integer, text, boolean, bigint, timestamp, json, customType, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Custom types mapping
// Prisma BigInt -> JS BigInt (handled by drizzle bigint mode: 'bigint')
// Prisma Bytes -> Buffer (handled by customType or simple bytes if available, Drizzle has customType)

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType() {
        return 'bytea';
    },
});

// Enums
export const qqBotType = pgEnum('QqBotType', ['napcat']);

// Tables

export const session = pgTable('Session', {
    id: serial('id').primaryKey(),
    dcId: integer('dcId'),
    port: integer('port'),
    serverAddress: text('serverAddress'),
    authKey: bytea('authKey'),
});

export const entity = pgTable('Entity', {
    id: serial('id').primaryKey(),
    entityId: text('entityId').notNull(),
    sessionId: integer('sessionId').notNull().references(() => session.id, { onDelete: 'cascade' }),
    hash: text('hash'),
    username: text('username'),
    phone: text('phone'),
    name: text('name'),
}, (t) => ({
    uniqueEntitySession: uniqueIndex('Entity_entityId_sessionId_key').on(t.entityId, t.sessionId),
}));

export const entityRelations = relations(entity, ({ one }) => ({
    session: one(session, {
        fields: [entity.sessionId],
        references: [session.id],
    }),
}));

export const sessionRelations = relations(session, ({ many }) => ({
    entities: many(entity),
}));

export const qqBot = pgTable('QqBot', {
    id: serial('id').primaryKey(),
    uin: bigint('uin', { mode: 'bigint' }).default(sql`0`),
    name: text('name'),
    password: text('password').default(''),
    platform: integer('platform').default(0),
    signApi: text('signApi'),
    signVer: text('signVer'),
    signDockerId: text('signDockerId'),
    type: qqBotType('type').default('napcat'),
    wsUrl: text('wsUrl'),
});

export const instance = pgTable('Instance', {
    id: serial('id').primaryKey(),
    owner: bigint('owner', { mode: 'bigint' }).default(sql`0`).notNull(),
    workMode: text('workMode').default('').notNull(),
    isSetup: boolean('isSetup').default(false).notNull(),
    botSessionId: integer('botSessionId'),
    userSessionId: integer('userSessionId'),
    qqBotId: integer('qqBotId').references(() => qqBot.id, { onDelete: 'cascade' }),
    flags: integer('flags').default(0).notNull(),
});

export const instanceRelations = relations(instance, ({ one, many }) => ({
    qqBot: one(qqBot, {
        fields: [instance.qqBotId],
        references: [qqBot.id],
    }),
    messages: many(message),
    forwardPairs: many(forwardPair),
    qqRequests: many(qqRequest),
    automationRules: many(automationRule),
    requestStatistics: one(requestStatistics),
}));

export const qqBotRelations = relations(qqBot, ({ many }) => ({
    instances: many(instance),
}));

export const message = pgTable('Message', {
    id: serial('id').primaryKey(),
    qqRoomId: bigint('qqRoomId', { mode: 'bigint' }).notNull(),
    qqSenderId: bigint('qqSenderId', { mode: 'bigint' }).notNull(),
    time: integer('time').notNull(),
    brief: text('brief'),
    seq: integer('seq').notNull(),
    rand: bigint('rand', { mode: 'bigint' }).notNull(),
    pktnum: integer('pktnum').notNull(),
    tgChatId: bigint('tgChatId', { mode: 'bigint' }).notNull(),
    tgMsgId: integer('tgMsgId').notNull(),
    instanceId: integer('instanceId').default(0).notNull().references(() => instance.id, { onDelete: 'cascade' }),
    tgFileId: bigint('tgFileId', { mode: 'bigint' }),
    tgMessageText: text('tgMessageText'),
    nick: text('nick'),
    tgSenderId: bigint('tgSenderId', { mode: 'bigint' }),
    richHeaderUsed: boolean('richHeaderUsed').default(false).notNull(),
    ignoreDelete: boolean('ignoreDelete').default(false).notNull(),
}, (t) => ({
    pkIndex: index('Message_qqRoomId_qqSenderId_seq_rand_pktnum_time_instanceId_idx').on(t.qqRoomId, t.qqSenderId, t.seq, t.rand, t.pktnum, t.time, t.instanceId),
    tgIndex: index('Message_tgChatId_tgMsgId_instanceId_idx').on(t.tgChatId, t.tgMsgId, t.instanceId),
}));

export const messageRelations = relations(message, ({ one }) => ({
    instance: one(instance, {
        fields: [message.instanceId],
        references: [instance.id],
    }),
}));

export const forwardPair = pgTable('ForwardPair', {
    id: serial('id').primaryKey(),
    qqRoomId: bigint('qqRoomId', { mode: 'bigint' }).notNull(),
    qqFromGroupId: bigint('qqFromGroupId', { mode: 'bigint' }),
    tgChatId: bigint('tgChatId', { mode: 'bigint' }).notNull(),
    tgThreadId: integer('tgThreadId'),
    instanceId: integer('instanceId').default(0).notNull().references(() => instance.id, { onDelete: 'cascade' }),
    flags: integer('flags').default(0).notNull(),
    ignoreRegex: text('ignoreRegex'),
    ignoreSenders: text('ignoreSenders'),
    forwardMode: text('forwardMode'),
    nicknameMode: text('nicknameMode'),
    commandReplyMode: text('commandReplyMode'),
    commandReplyFilter: text('commandReplyFilter'),
    commandReplyList: text('commandReplyList'),
    notifyTelegram: boolean('notifyTelegram').default(false).notNull(),
    notifyQQ: boolean('notifyQQ').default(false).notNull(),
    apiKey: text('apiKey').default('gen_random_uuid()').notNull(), // Should be UUID type ideally
}, (t) => ({
    uniqueQq: uniqueIndex('ForwardPair_qqRoomId_instanceId_key').on(t.qqRoomId, t.instanceId),
    uniqueTg: uniqueIndex('ForwardPair_tgChatId_tgThreadId_instanceId_key').on(t.tgChatId, t.tgThreadId, t.instanceId),
    uniqueApiKey: uniqueIndex('ForwardPair_apiKey_key').on(t.apiKey),
}));

export const forwardPairRelations = relations(forwardPair, ({ one, many }) => ({
    instance: one(instance, {
        fields: [forwardPair.instanceId],
        references: [instance.id],
    }),
    avatarCache: one(avatarCache), // In prisma it's array but relation is foreign key on avatar cache so 1-1 or 1-many? Prisma: ForwardPair has AvatarCache[], AvatarCache has forwardPairId @unique. So 1-1 mostly or 1-many with unique constraint. It's 1-1.
    forwardMultiple: many(forwardMultiple),
}));

export const avatarCache = pgTable('AvatarCache', {
    id: serial('id').primaryKey(),
    forwardPairId: integer('forwardPairId').notNull().references(() => forwardPair.id, { onDelete: 'cascade' }),
    hash: bytea('hash').notNull(),
}, (t) => ({
    uniquePair: uniqueIndex('AvatarCache_forwardPairId_key').on(t.forwardPairId),
}));

export const avatarCacheRelations = relations(avatarCache, ({ one }) => ({
    forwardPair: one(forwardPair, {
        fields: [avatarCache.forwardPairId],
        references: [forwardPair.id],
    }),
}));

// Other tables...
// Implementing a subset first to ensure correctness, then will add the rest.
// For brevity in this turn, I'll stop here and continue in next turn or if I can fit all.
// I'll add the rest to be complete.

export const file = pgTable('File', {
    id: serial('id').primaryKey(),
    roomId: bigint('roomId', { mode: 'bigint' }).notNull(),
    fileId: text('fileId').notNull(),
    info: text('info').notNull(),
    name: text('name'),
});

export const flashPhoto = pgTable('FlashPhoto', {
    id: serial('id').primaryKey(),
    photoMd5: text('photoMd5').notNull(),
});

export const flashPhotoRelations = relations(flashPhoto, ({ many }) => ({
    views: many(flashPhotoView),
}));

export const flashPhotoView = pgTable('FlashPhotoView', {
    id: serial('id').primaryKey(),
    flashPhotoId: integer('flashPhotoId').notNull().references(() => flashPhoto.id),
    viewerId: bigint('viewerId', { mode: 'bigint' }).notNull(),
}, (t) => ({
    uniqueView: uniqueIndex('FlashPhotoView_flashPhotoId_viewerId_key').on(t.flashPhotoId, t.viewerId),
}));

export const flashPhotoViewRelations = relations(flashPhotoView, ({ one }) => ({
    flashPhoto: one(flashPhoto, {
        fields: [flashPhotoView.flashPhotoId],
        references: [flashPhoto.id],
    }),
}));

export const forwardMultiple = pgTable('ForwardMultiple', {
    id: text('id').primaryKey().default('gen_random_uuid()'),
    resId: text('resId').notNull(),
    fileName: text('fileName').notNull(),
    fromPairId: integer('fromPairId').notNull().references(() => forwardPair.id, { onDelete: 'cascade' }),
});

export const forwardMultipleRelations = relations(forwardMultiple, ({ one }) => ({
    fromPair: one(forwardPair, {
        fields: [forwardMultiple.fromPairId],
        references: [forwardPair.id],
    }),
}));

export const adminUser = pgTable('AdminUser', {
    id: serial('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('passwordHash').notNull(),
    displayName: text('displayName'),
    email: text('email'),
    isActive: boolean('isActive').default(true).notNull(),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(), //$updatedAt equivalent needs trigger or app logic
}, (t) => ({
    uniqueUsername: uniqueIndex('AdminUser_username_key').on(t.username),
    idxUsername: index('AdminUser_username_idx').on(t.username),
}));

export const adminUserRelations = relations(adminUser, ({ many }) => ({
    sessions: many(adminSession),
    auditLogs: many(adminAuditLog),
}));

export const adminSession = pgTable('AdminSession', {
    id: text('id').primaryKey().default('gen_random_uuid()'),
    userId: integer('userId').notNull().references(() => adminUser.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expiresAt').notNull(),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
}, (t) => ({
    uniqueToken: uniqueIndex('AdminSession_token_key').on(t.token),
    idxUser: index('AdminSession_userId_idx').on(t.userId),
    idxToken: index('AdminSession_token_idx').on(t.token),
    idxExpires: index('AdminSession_expiresAt_idx').on(t.expiresAt),
}));

export const adminSessionRelations = relations(adminSession, ({ one }) => ({
    user: one(adminUser, {
        fields: [adminSession.userId],
        references: [adminUser.id],
    }),
}));

export const accessToken = pgTable('AccessToken', {
    id: serial('id').primaryKey(),
    token: text('token').notNull(),
    description: text('description'),
    isActive: boolean('isActive').default(true).notNull(),
    expiresAt: timestamp('expiresAt'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    createdBy: integer('createdBy'),
    lastUsedAt: timestamp('lastUsedAt'),
}, (t) => ({
    uniqueToken: uniqueIndex('AccessToken_token_key').on(t.token),
    idxToken: index('AccessToken_token_idx').on(t.token),
    idxActive: index('AccessToken_isActive_idx').on(t.isActive),
}));

export const adminAuditLog = pgTable('AdminAuditLog', {
    id: serial('id').primaryKey(),
    userId: integer('userId').references(() => adminUser.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resource: text('resource'),
    resourceId: text('resourceId'),
    details: json('details'),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
    idxUser: index('AdminAuditLog_userId_idx').on(t.userId),
    idxAction: index('AdminAuditLog_action_idx').on(t.action),
    idxCreated: index('AdminAuditLog_createdAt_idx').on(t.createdAt),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
    user: one(adminUser, {
        fields: [adminAuditLog.userId],
        references: [adminUser.id],
    }),
}));

export const globalConfig = pgTable('GlobalConfig', {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
    updatedBy: integer('updatedBy'),
}, (t) => ({
    uniqueKey: uniqueIndex('GlobalConfig_key_key').on(t.key),
    idxKey: index('GlobalConfig_key_idx').on(t.key),
}));

export const qqRequest = pgTable('QQRequest', {
    id: serial('id').primaryKey(),
    instanceId: integer('instanceId').notNull().references(() => instance.id, { onDelete: 'cascade' }),
    flag: text('flag').notNull(),
    type: text('type').notNull(),
    subType: text('subType'),
    userId: bigint('userId', { mode: 'bigint' }).notNull(),
    groupId: bigint('groupId', { mode: 'bigint' }),
    comment: text('comment'),
    status: text('status').default('pending').notNull(),
    handledBy: bigint('handledBy', { mode: 'bigint' }),
    handledAt: timestamp('handledAt'),
    rejectReason: text('rejectReason'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
    uniqueFlag: uniqueIndex('QQRequest_flag_key').on(t.flag),
    idxInstanceStatus: index('QQRequest_instanceId_status_idx').on(t.instanceId, t.status),
    idxFlag: index('QQRequest_flag_idx').on(t.flag),
    idxCreated: index('QQRequest_createdAt_idx').on(t.createdAt),
}));

export const qqRequestRelations = relations(qqRequest, ({ one }) => ({
    instance: one(instance, {
        fields: [qqRequest.instanceId],
        references: [instance.id],
    }),
}));

export const automationRule = pgTable('AutomationRule', {
    id: serial('id').primaryKey(),
    instanceId: integer('instanceId').notNull().references(() => instance.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    target: text('target').notNull(),
    conditions: json('conditions').notNull(),
    action: text('action').notNull(),
    reason: text('reason'),
    enabled: boolean('enabled').default(true).notNull(),
    priority: integer('priority').default(0).notNull(),
    matchCount: integer('matchCount').default(0).notNull(),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (t) => ({
    idxInstanceEnabled: index('AutomationRule_instanceId_enabled_idx').on(t.instanceId, t.enabled),
    idxTypeTarget: index('AutomationRule_type_target_idx').on(t.type, t.target),
}));

export const automationRuleRelations = relations(automationRule, ({ one }) => ({
    instance: one(instance, {
        fields: [automationRule.instanceId],
        references: [instance.id],
    }),
}));

export const requestStatistics = pgTable('RequestStatistics', {
    id: serial('id').primaryKey(),
    instanceId: integer('instanceId').notNull().references(() => instance.id, { onDelete: 'cascade' }),
    friendTotal: integer('friendTotal').default(0).notNull(),
    friendPending: integer('friendPending').default(0).notNull(),
    friendApproved: integer('friendApproved').default(0).notNull(),
    friendRejected: integer('friendRejected').default(0).notNull(),
    groupTotal: integer('groupTotal').default(0).notNull(),
    groupPending: integer('groupPending').default(0).notNull(),
    groupApproved: integer('groupApproved').default(0).notNull(),
    groupRejected: integer('groupRejected').default(0).notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (t) => ({
    uniqueInstance: uniqueIndex('RequestStatistics_instanceId_key').on(t.instanceId),
}));

export const requestStatisticsRelations = relations(requestStatistics, ({ one }) => ({
    instance: one(instance, {
        fields: [requestStatistics.instanceId],
        references: [instance.id],
    }),
}));
