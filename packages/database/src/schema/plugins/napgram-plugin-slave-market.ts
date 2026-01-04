import { pgSchema, serial, integer, text, bigint, boolean, timestamp, json, index, uniqueIndex, doublePrecision } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Define the schema
export const smSchema = pgSchema('slave_market');

// Players Table
export const players = smSchema.table('slave_market_players', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    plainUserId: text('plainUserId'),
    nickname: text('nickname').notNull(),
    balance: integer('balance').default(0).notNull(),
    deposit: integer('deposit').default(0).notNull(),
    worth: integer('worth').default(100).notNull(),
    creditLevel: integer('creditLevel').default(1).notNull(),
    depositLimit: integer('depositLimit').default(1000).notNull(),
    loanBalance: integer('loanBalance').default(0).notNull(),
    loanCreditLevel: integer('loanCreditLevel').default(1).notNull(),
    ownerId: text('ownerId'),
    ownedTime: bigint('ownedTime', { mode: 'bigint' }),
    vipEndTime: bigint('vipEndTime', { mode: 'bigint' }),
    registerTime: bigint('registerTime', { mode: 'bigint' }).notNull(),
    registerSource: text('registerSource'),

    // Cooldowns
    lastWorkTime: bigint('lastWorkTime', { mode: 'bigint' }),
    lastRobTime: bigint('lastRobTime', { mode: 'bigint' }),
    lastTransferTime: bigint('lastTransferTime', { mode: 'bigint' }),
    lastBuyTime: bigint('lastBuyTime', { mode: 'bigint' }),
    lastPlantTime: bigint('lastPlantTime', { mode: 'bigint' }),
    lastHarvestTime: bigint('lastHarvestTime', { mode: 'bigint' }),

    // Interest
    lastInterestTime: bigint('lastInterestTime', { mode: 'bigint' }),
    lastLoanInterestTime: bigint('lastLoanInterestTime', { mode: 'bigint' }),

    // Status
    isAdmin: boolean('isAdmin').default(false).notNull(),
    commandBanned: boolean('commandBanned').default(false).notNull(),

    // Bodyguard
    bodyguardName: text('bodyguardName'),
    bodyguardEndTime: bigint('bodyguardEndTime', { mode: 'bigint' }),

    // Jail
    jailEndTime: bigint('jailEndTime', { mode: 'bigint' }),
    jailWorkIncome: integer('jailWorkIncome').default(0).notNull(),
}, (t) => ({
    uniqueUserId: uniqueIndex('slave_market_players_userId_key').on(t.userId),
    idxUserId: index('slave_market_players_userId_idx').on(t.userId),
    idxOwnerId: index('slave_market_players_ownerId_idx').on(t.ownerId),
    idxRegisterSource: index('slave_market_players_registerSource_idx').on(t.registerSource),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
    owner: one(players, {
        fields: [players.ownerId],
        references: [players.userId],
        relationName: 'OwnerSlaves',
    }),
    slaves: many(players, { relationName: 'OwnerSlaves' }),
    transactions: many(transactions),
    farmLands: many(farmLands),
    appearances: many(appearances),
}));

// Transactions Table
export const transactions = smSchema.table('slave_market_transactions', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    balance: integer('balance').notNull(),
    targetId: text('targetId'),
    description: text('description'),
    metadata: json('metadata'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
    idxUserIdCreated: index('slave_market_transactions_userId_createdAt_idx').on(t.userId, t.createdAt),
    idxType: index('slave_market_transactions_type_idx').on(t.type),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
    player: one(players, {
        fields: [transactions.userId],
        references: [players.userId],
    }),
}));

// Farm Lands Table
export const farmLands = smSchema.table('slave_market_farm_lands', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    plotIndex: integer('plotIndex').notNull(),
    cropType: text('cropType'),
    plantTime: bigint('plantTime', { mode: 'bigint' }),
    harvestTime: bigint('harvestTime', { mode: 'bigint' }),
}, (t) => ({
    uniqueUserPlot: uniqueIndex('slave_market_farm_lands_userId_plotIndex_key').on(t.userId, t.plotIndex),
    idxUserId: index('slave_market_farm_lands_userId_idx').on(t.userId),
}));

export const farmLandsRelations = relations(farmLands, ({ one }) => ({
    player: one(players, {
        fields: [farmLands.userId],
        references: [players.userId],
    }),
}));

// Appearance Table
export const appearances = smSchema.table('slave_market_appearances', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    itemName: text('itemName').notNull(),
    slot: text('slot').notNull(),
    equipped: boolean('equipped').default(false).notNull(),
    acquiredAt: timestamp('acquiredAt').defaultNow().notNull(),
}, (t) => ({
    uniqueUserItem: uniqueIndex('slave_market_appearances_userId_itemName_key').on(t.userId, t.itemName),
    idxUserEquipped: index('slave_market_appearances_userId_equipped_idx').on(t.userId, t.equipped),
}));

export const appearancesRelations = relations(appearances, ({ one }) => ({
    player: one(players, {
        fields: [appearances.userId],
        references: [players.userId],
    }),
}));

// Red Packet Table
export const redPackets = smSchema.table('slave_market_red_packets', {
    id: serial('id').primaryKey(),
    packetId: text('packetId').notNull(),
    senderId: text('senderId').notNull(),
    senderName: text('senderName').notNull(),
    totalAmount: integer('totalAmount').notNull(),
    totalCount: integer('totalCount').notNull(),
    remaining: integer('remaining').notNull(),
    scopeKey: text('scopeKey').notNull(),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    expiresAt: timestamp('expiresAt').notNull(),
}, (t) => ({
    uniquePacketId: uniqueIndex('slave_market_red_packets_packetId_key').on(t.packetId),
    idxScope: index('slave_market_red_packets_scopeKey_idx').on(t.scopeKey),
    idxCreated: index('slave_market_red_packets_createdAt_idx').on(t.createdAt),
}));

export const redPacketsRelations = relations(redPackets, ({ many }) => ({
    grabs: many(redPacketGrabs),
}));

// Red Packet Grabs Table
export const redPacketGrabs = smSchema.table('slave_market_red_packet_grabs', {
    id: serial('id').primaryKey(),
    packetId: text('packetId').notNull(),
    userId: text('userId').notNull(),
    userName: text('userName').notNull(),
    amount: integer('amount').notNull(),
    grabbedAt: timestamp('grabbedAt').defaultNow().notNull(),
}, (t) => ({
    uniquePacketUser: uniqueIndex('slave_market_red_packet_grabs_packetId_userId_key').on(t.packetId, t.userId),
    idxUserId: index('slave_market_red_packet_grabs_userId_idx').on(t.userId),
}));

export const redPacketGrabsRelations = relations(redPacketGrabs, ({ one }) => ({
    packet: one(redPackets, {
        fields: [redPacketGrabs.packetId],
        references: [redPackets.packetId],
    }),
}));

// VIP Cards Table
export const vipCards = smSchema.table('slave_market_vip_cards', {
    id: serial('id').primaryKey(),
    cardCode: text('cardCode').notNull(),
    cardType: text('cardType').notNull(),
    duration: integer('duration').notNull(),
    used: boolean('used').default(false).notNull(),
    usedBy: text('usedBy'),
    usedAt: timestamp('usedAt'),
    createdBy: text('createdBy').notNull(),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
    uniqueCardCode: uniqueIndex('slave_market_vip_cards_cardCode_key').on(t.cardCode),
    idxUsed: index('slave_market_vip_cards_used_idx').on(t.used),
    idxCardCode: index('slave_market_vip_cards_cardCode_idx').on(t.cardCode),
}));

// System Table
export const system = smSchema.table('slave_market_system', {
    id: serial('id').primaryKey(),
    isDisabled: boolean('isDisabled').default(false).notNull(),
    lastAssetDecayTime: bigint('lastAssetDecayTime', { mode: 'bigint' }),
    metadata: json('metadata'),
});

// Admin Table
export const admins = smSchema.table('slave_market_admins', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    nickname: text('nickname').notNull(),
    addedBy: text('addedBy').notNull(),
    addedAt: timestamp('addedAt').defaultNow().notNull(),
}, (t) => ({
    uniqueUserId: uniqueIndex('slave_market_admins_userId_key').on(t.userId),
}));

// Stocks Table (Positions)
export const stockPositions = smSchema.table('slave_market_stocks', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    scopeId: text('scopeId'),
    symbol: text('symbol').notNull(),
    market: text('market'),
    quantity: integer('quantity').default(0).notNull(),
    avgCost: doublePrecision('avgCost').default(0).notNull(),
    currency: text('currency').default('USD'),
    lastPrice: doublePrecision('lastPrice').default(0),
    lastUpdate: bigint('lastUpdate', { mode: 'bigint' }),
    lastTradeTime: bigint('lastTradeTime', { mode: 'bigint' }),
}, (t) => ({
    idxUserSymbol: index('slave_market_stocks_userId_symbol_idx').on(t.userId, t.symbol),
}));

// Stock Orders History
export const stockOrders = smSchema.table('slave_market_stock_orders', {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    scopeId: text('scopeId'),
    symbol: text('symbol').notNull(),
    market: text('market'),
    side: text('side').notNull(), // buy/sell
    quantity: integer('quantity').notNull(),
    price: doublePrecision('price').notNull(),
    fee: integer('fee').default(0).notNull(),
    amount: integer('amount').notNull(), // total amount
    status: text('status').default('success'),
    createdAt: bigint('createdAt', { mode: 'bigint' }).notNull(),
    dateKey: bigint('dateKey', { mode: 'bigint' }), // for daily limits
    extra: json('extra'),
}, (t) => ({
    idxUserDate: index('slave_market_stock_orders_userId_dateKey_idx').on(t.userId, t.dateKey),
}));

// Stock Quotes Cache
export const stockQuotes = smSchema.table('slave_market_stock_quotes', {
    symbol: text('symbol').primaryKey(),
    market: text('market'),
    price: doublePrecision('price').notNull(),
    open: doublePrecision('open'),
    high: doublePrecision('high'),
    low: doublePrecision('low'),
    prevClose: doublePrecision('prevClose'),
    ts: bigint('ts', { mode: 'bigint' }).notNull(), // quote timestamp
    scopeId: text('scopeId'),
    source: text('source'),
    payload: json('payload'),
}, (t) => ({
    idxTs: index('slave_market_stock_quotes_ts_idx').on(t.ts),
}));

// Export types
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type FarmLand = typeof farmLands.$inferSelect;
export type Appearance = typeof appearances.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type StockPosition = typeof stockPositions.$inferSelect;
export type StockOrder = typeof stockOrders.$inferSelect;
export type StockQuote = typeof stockQuotes.$inferSelect;

