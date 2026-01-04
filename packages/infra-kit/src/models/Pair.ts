import type { Friend, Group, IQQClient } from '@napgram/qq-client'
import { TelegramChat } from '@napgram/telegram-client'
import { Buffer } from 'node:buffer'
import db, { schema, eq } from '../db'
import getLogger from '../logger'
import * as hashingUtils from '../utils/hashing'
const { md5 } = hashingUtils
import { getAvatar } from '../utils/urls'
import flags from '../flags'

const log = getLogger('ForwardPair')

export class Pair {
    private static readonly apiKeyMap = new Map<string, Pair>()

    public static getByApiKey(key: string) {
        return this.apiKeyMap.get(key)
    }

    private static readonly dbIdMap = new Map<number, Pair>()

    public static getByDbId(dbId: number) {
        return this.dbIdMap.get(dbId)
    }

    // 群成员的 tg 账号对应它对应的 QQ 账号获取到的 Group 对象
    // 只有群组模式有效
    public readonly instanceMapForTg = {} as { [tgUserId: string]: Group }

    constructor(
        public readonly qq: Friend | Group,
        private _tg: TelegramChat,
        public readonly tgUser: TelegramChat,
        public dbId: number,
        private _flags: number,
        public readonly apiKey: string,
        public readonly qqClient: IQQClient,
    ) {
        if (apiKey) {
            Pair.apiKeyMap.set(apiKey, this)
        }
        Pair.dbIdMap.set(dbId, this)
    }

    // 更新 TG 群组的头像和简介
    public async updateInfo() {
        const rows = await db.select().from(schema.avatarCache)
            .where(eq(schema.avatarCache.forwardPairId, this.dbId))
            .limit(1)
        const avatarCache = rows[0]
        const lastHash = avatarCache ? avatarCache.hash : null
        const avatar = await getAvatar(this.qqRoomId)
        const newHash = md5(avatar)
        // Skip updating about text for now (getAboutText was removed)
        // 更新群名（如果未锁定且是群组）
        if (!(this.flags & flags.NAME_LOCKED) && this.qqRoomId < 0) {
            try {
                const groupInfo = await this.qqClient.getGroupInfo(String(-this.qqRoomId))
                if (groupInfo && groupInfo.name) {
                    await this._tg.editTitle(groupInfo.name)
                }
            }
            catch (e: any) {
                log.error(`修改群名失败: ${e.message}`)
            }
        }

        if (!lastHash || Buffer.from(lastHash).compare(newHash) !== 0) {
            log.debug(`更新群头像: ${this.qqRoomId}`)
            await this._tg.setProfilePhoto(avatar)
            if (avatarCache) {
                await db.update(schema.avatarCache)
                    .set({ hash: newHash })
                    .where(eq(schema.avatarCache.forwardPairId, this.dbId))
            } else {
                await db.insert(schema.avatarCache)
                    .values({ forwardPairId: this.dbId, hash: newHash })
            }
        }
    }

    get qqRoomId() {
        return 'uin' in this.qq ? this.qq.uin : -this.qq.gid
    }

    get tgId() {
        return Number(this._tg.id)
    }

    get tg() {
        return this._tg
    }

    set tg(value: TelegramChat) {
        this._tg = value
        db.update(schema.forwardPair)
            .set({ tgChatId: BigInt(value.id) })
            .where(eq(schema.forwardPair.id, this.dbId))
            .then(() => log.info(`出现了到超级群组的转换: ${value.id}`))
    }

    get flags() {
        return this._flags
    }

    set flags(value) {
        this._flags = value
        db.update(schema.forwardPair)
            .set({ flags: value })
            .where(eq(schema.forwardPair.id, this.dbId))
            .then(() => 0)
    }
}
