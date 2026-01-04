import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@napgram/infra-kit'
import Instance from '../Instance'

// Local mock removed to rely on fixed global mock
const { mockUpdate, mockInsert } = vi.hoisted(() => ({
    mockUpdate: vi.fn(() => ({
        set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue({}),
        })),
    })),
    mockInsert: vi.fn(() => ({
        values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        })),
    })),
}))

vi.mock('@napgram/infra-kit', () => ({
    db: {
        query: {
            instance: {
                findFirst: vi.fn(),
            },
        },
        insert: mockInsert,
        update: mockUpdate,
    },
    schema: { instance: { id: 'id' } },
    eq: vi.fn(),
    env: {
        TG_BOT_TOKEN: 'fake-token',
        NAPCAT_WS_URL: 'ws://fake',
        LOG_FILE: '/tmp/test.log',
        DATA_DIR: '/tmp/data',
        CACHE_DIR: '/tmp/cache',
    },
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        trace: vi.fn(),
    })),
    ForwardMap: {
        load: vi.fn().mockResolvedValue({ map: true }),
    },
    sentry: {
        captureException: vi.fn(),
    },
}))

vi.mock('../../../infrastructure/clients/qq', () => ({
    qqClientFactory: { create: vi.fn().mockResolvedValue({ login: vi.fn(), on: vi.fn() }) },
}))

// Mock telegram with undefined sessionId
vi.mock('../../../infrastructure/clients/telegram', () => ({
    telegramClientFactory: {
        connect: vi.fn(),
        create: vi.fn().mockResolvedValue({
            sessionId: undefined, // The Key Difference
            start: vi.fn(),
            setParseMode: vi.fn(),
            me: { id: 123, username: 'test_bot' },
        }),
    },
}))

vi.mock('@napgram/runtime-kit', () => ({
    InstanceRegistry: { add: vi.fn() },
}))

vi.mock('@napgram/plugin-kit', () => ({
    getEventPublisher: vi.fn(() => ({
        publishInstanceStatus: vi.fn(),
    })),
}))

describe('Instance Session Coverage', () => {
    it('should default botSessionId to 0 when sessionId is undefined', async () => {
        // Setup mock return values via the global mock
        vi.mocked(db.query.instance.findFirst).mockResolvedValue({ id: 1 } as any)

        const instance = await Instance.createNew('token') as Instance

        expect(instance.botSessionId).toBe(0)
    })
})
