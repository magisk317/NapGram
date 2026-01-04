import db, { schema, eq, and } from '../db'
import getLogger from '../logger'

const logger = getLogger('ForwardMap')

export interface ForwardPairRecord {
    id: number
    qqRoomId: bigint
    tgChatId: bigint
    tgThreadId?: number | null // Telegram 话题 ID
    flags: number
    instanceId: number
    apiKey: string
    ignoreRegex?: string | null
    ignoreSenders?: string | null
    forwardMode?: string | null
    nicknameMode?: string | null
    commandReplyMode?: string | null
    commandReplyFilter?: string | null
    commandReplyList?: string | null
}

/**
 * 轻量级转发表，仅依赖数据库，不依赖 icqq。
 */
export class ForwardMap {
    private byQQ = new Map<string, ForwardPairRecord>()
    private byTG = new Map<string, ForwardPairRecord>() // Key: "chatId" or "chatId:threadId"

    private constructor(
        pairs: ForwardPairRecord[],
        private readonly instanceId: number,
    ) {
        for (const pair of pairs) {
            this.byQQ.set(pair.qqRoomId.toString(), pair)
            this.byTG.set(this.getTgKey(pair.tgChatId, pair.tgThreadId), pair)
        }
    }

    static async load(instanceId: number) {
        const rows = await db.select().from(schema.forwardPair).where(eq(schema.forwardPair.instanceId, instanceId))
        return new ForwardMap(rows as ForwardPairRecord[], instanceId)
    }

    /**
     * Reload mappings from database (in-place).
     * This is used by the web admin panel so changes take effect without restarting the process.
     */
    async reload() {
        const rows = await db.select().from(schema.forwardPair).where(eq(schema.forwardPair.instanceId, this.instanceId))


        this.byQQ.clear()
        this.byTG.clear()
        for (const pair of rows as any as ForwardPairRecord[]) {
            this.byQQ.set(pair.qqRoomId.toString(), pair)
            this.byTG.set(this.getTgKey(pair.tgChatId, pair.tgThreadId), pair)
        }
    }

    // 兼容旧接口：根据 QQ/TG/数字进行查找
    find(target: any) {
        if (!target)
            return null
        if (typeof target === 'object' && 'uin' in target) {
            return this.findByQQ((target as any).uin)
        }
        if (typeof target === 'object' && 'gid' in target) {
            return this.findByQQ((target as any).gid)
        }
        if (typeof target === 'object' && 'id' in target) {
            return this.findByTG((target as any).id)
        }
        return this.findByQQ(target) || this.findByTG(target) || null
    }

    async add(qqRoomId: string | number | bigint, tgChatId: string | number | bigint, tgThreadId?: number) {
        const normalizedThreadId = tgThreadId ?? null
        const existingByQQ = this.findByQQ(qqRoomId)
        const existingByTG = this.findByTG(tgChatId, tgThreadId, false)

        // 如果目标 TG 话题已被其他 QQ 占用，则返回该记录以便上层处理
        if (existingByTG && (!existingByQQ || existingByTG.id !== existingByQQ.id)) {
            return existingByTG
        }

        // 已存在该 QQ 的绑定，直接更新到新的话题
        if (existingByQQ) {
            // 目标一致则直接返回
            if (
                existingByQQ.tgChatId === BigInt(tgChatId)
                && (existingByQQ.tgThreadId ?? null) === normalizedThreadId
            ) {
                return existingByQQ
            }

            const updatedArr = await db.update(schema.forwardPair)
                .set({
                    tgChatId: BigInt(tgChatId),
                    tgThreadId: normalizedThreadId,
                })
                .where(eq(schema.forwardPair.id, existingByQQ.id))
                .returning()
            const rec = updatedArr[0] as ForwardPairRecord
            this.refreshMaps(existingByQQ, rec)
            return rec
        }

        const rowArr = await db.insert(schema.forwardPair)
            .values({
                qqRoomId: BigInt(qqRoomId),
                tgChatId: BigInt(tgChatId),
                tgThreadId: normalizedThreadId,
                instanceId: this.instanceId,
            })
            .returning()
        const rec = rowArr[0] as ForwardPairRecord
        this.byQQ.set(rec.qqRoomId.toString(), rec)
        this.byTG.set(this.getTgKey(rec.tgChatId, rec.tgThreadId), rec)
        return rec
    }

    async remove(target: string | number | bigint) {
        const rec = this.find(target)
        if (!rec)
            return false
        await db.delete(schema.forwardPair).where(eq(schema.forwardPair.id, rec.id))
        this.byQQ.delete(rec.qqRoomId.toString())
        this.byTG.delete(this.getTgKey(rec.tgChatId, rec.tgThreadId))
        return true
    }

    async initMapInstance(): Promise<void> { }

    findByQQ(qqRoomId: string | number | bigint): ForwardPairRecord | undefined {
        return this.byQQ.get(String(qqRoomId))
    }

    findByTG(tgChatId: string | number | bigint, tgThreadId?: number, allowFallback = true): ForwardPairRecord | undefined {
        const key = this.getTgKey(tgChatId, tgThreadId)
        const exact = this.byTG.get(key)

        // Debug log for troubleshooting
        if (!exact && (this.byTG.size > 0)) {
            logger.debug(`[ForwardMap] findByTG failed. Key: "${key}", Total keys: ${this.byTG.size}`)
            logger.debug(`[ForwardMap] Available keys: ${Array.from(this.byTG.keys()).join(', ')}`)
        }

        if (exact)
            return exact
        return allowFallback ? this.byTG.get(String(tgChatId)) : undefined // Fallback to chatId only
    }

    getAll() {
        return Array.from(this.byQQ.values())
    }

    private getTgKey(tgChatId: string | number | bigint, tgThreadId?: number | null) {
        return tgThreadId ? `${tgChatId}:${tgThreadId}` : String(tgChatId)
    }

    private refreshMaps(oldRec: ForwardPairRecord, newRec: ForwardPairRecord) {
        this.byQQ.set(newRec.qqRoomId.toString(), newRec)
        this.byTG.delete(this.getTgKey(oldRec.tgChatId, oldRec.tgThreadId))
        this.byTG.set(this.getTgKey(newRec.tgChatId, newRec.tgThreadId), newRec)
    }
}

export default ForwardMap
