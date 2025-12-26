import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramSender } from '../TelegramSender'
import db from '../../../../domain/models/db'
import env from '../../../../domain/models/env'

vi.mock('../../../../domain/models/db', () => ({
    default: {
        forwardMultiple: {
            create: vi.fn().mockResolvedValue({ id: 1 }),
        },
    },
}))

vi.mock('../../../../domain/models/env', () => ({
    default: {
        DATA_DIR: '/tmp/napgram-test-data',
        WEB_ENDPOINT: 'http://example.com',
        LOG_FILE: '/tmp/napgram-test-data/test.log',
    },
}))

describe('TelegramSender', () => {
    const mockInstance = {
        id: 1,
        flags: 0,
        tgBot: {
            downloadMedia: vi.fn(),
        },
    } as any
    const mockChat = {
        id: 100,
        sendMessage: vi.fn().mockResolvedValue({ id: 123 }),
        client: {
            sendMedia: vi.fn().mockResolvedValue({ id: 456 }),
        }
    } as any

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('sendToTelegram sends simple text message', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'text', data: { text: 'hello' } }]
        }
        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(mockChat.sendMessage).toHaveBeenCalledWith('hello', expect.any(Object))
    })

    it('sendToTelegram handles nickname mode 10 (show nickname)', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'text', data: { text: 'hello' } }]
        }
        await sender.sendToTelegram(mockChat, msg, { apiKey: 'key' }, undefined, '10')
        expect(mockChat.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ text: expect.stringContaining('hello') }),
            expect.any(Object)
        )
    })

    it('sendToTelegram handles media group (photo/video)', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [
                { type: 'image', data: { file: Buffer.from('img') } },
                { type: 'video', data: { file: Buffer.from('vid') } }
            ]
        }
        // Mock mediaSender.sendMediaGroup
        const sendMediaGroupSpy = vi.spyOn((sender as any).mediaSender, 'sendMediaGroup').mockResolvedValue({ id: 789 })

        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(sendMediaGroupSpy).toHaveBeenCalled()
    })

    it('sendToTelegram handles audio message', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'audio', data: { file: Buffer.from('aud') } }]
        }
        // Mock sendMediaToTG indirectly
        vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('norm'), fileName: 'aud.ogg' })
        vi.spyOn((sender as any).audioConverter, 'prepareVoiceMedia').mockResolvedValue({ type: 'voice', file: Buffer.from('voice') })

        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(mockChat.client.sendMedia).toHaveBeenCalled()
        const mediaInput = mockChat.client.sendMedia.mock.calls[0][1]
        expect(mediaInput.type).toBe('voice')
    })

    it('sendToTelegram handles dice message', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'dice', data: { emoji: '🎲' } }]
        }
        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'dice' }), expect.any(Object))
    })

    it('sendToTelegram falls back to text for unsupported dice', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'dice', data: { emoji: '🎉', value: 3 } }]
        }
        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(mockChat.sendMessage).toHaveBeenCalled()
        expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
    })

    it('sendToTelegram handles forward message', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'forward', data: { id: 'f1' } }]
        }
        await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
        expect(db.forwardMultiple.create).toHaveBeenCalled()
        expect(mockChat.sendMessage).toHaveBeenCalledWith(expect.stringContaining('[转发消息]'), expect.any(Object))
    })

    it('sendToTelegram handles location message', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'location', data: { latitude: 1, longitude: 2 } }]
        }
        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'geo' }), expect.any(Object))
    })

    it('sendToTelegram sends venue when location has title', async () => {
        const sender = new TelegramSender(mockInstance)
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'location', data: { latitude: 1, longitude: 2, title: 'Place', address: 'Addr' } }]
        }
        await sender.sendToTelegram(mockChat, msg, {}, undefined, '00')
        expect(mockChat.client.sendMedia).toHaveBeenCalledWith(100, expect.objectContaining({ type: 'venue' }), expect.any(Object))
    })

    it('sendMediaToTG sends placeholder when file missing', async () => {
        const sender = new TelegramSender(mockInstance)
        const content: any = { type: 'file', data: { file: 'missing', filename: 'report.txt' } }
        vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('missing')
        vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue(undefined)

        const result = await (sender as any).sendMediaToTG(mockChat, '', content)

        expect(mockChat.sendMessage).toHaveBeenCalledWith('[文件不可用] report.txt', expect.any(Object))
        expect(mockChat.client.sendMedia).not.toHaveBeenCalled()
        expect(result).toBeNull()
    })

    it('sendMediaToTG retries without ttlSeconds when sendMedia fails', async () => {
        const sender = new TelegramSender(mockInstance)
        const content: any = { type: 'image', data: { file: '/tmp/test.jpg' } }
        vi.spyOn((sender as any).fileNormalizer, 'resolveMediaInput').mockResolvedValue('/tmp/test.jpg')
        vi.spyOn((sender as any).fileNormalizer, 'normalizeInputFile').mockResolvedValue({ data: Buffer.from('img'), fileName: 'test.jpg' })
        vi.spyOn((sender as any).fileNormalizer, 'isGifMedia').mockReturnValue(false)

        const ttlValues: Array<number | undefined> = []
        mockChat.client.sendMedia.mockImplementation((_chatId: any, mediaInput: any) => {
            ttlValues.push(mediaInput.ttlSeconds)
            if (ttlValues.length === 1)
                return Promise.reject(new Error('fail'))
            return Promise.resolve({ id: 999 })
        })

        const prevTtl = env.TG_MEDIA_TTL_SECONDS
        env.TG_MEDIA_TTL_SECONDS = 5 as any
        try {
            await (sender as any).sendMediaToTG(mockChat, 'head', content)
        }
        finally {
            env.TG_MEDIA_TTL_SECONDS = prevTtl as any
        }

        expect(mockChat.client.sendMedia).toHaveBeenCalledTimes(2)
        expect(ttlValues).toEqual([5, undefined])
    })

    it('sendToTelegram sends forward without WEB_ENDPOINT', async () => {
        const sender = new TelegramSender(mockInstance)
        const prevEndpoint = env.WEB_ENDPOINT
        env.WEB_ENDPOINT = '' as any
        try {
            const msg: any = {
                sender: { id: 'q1', name: 'QQUser' },
                content: [{ type: 'forward', data: { id: 'f1' } }]
            }
            await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
            expect(mockChat.sendMessage).toHaveBeenCalledWith(expect.stringContaining('未配置 WEB_ENDPOINT'), expect.any(Object))
        }
        finally {
            env.WEB_ENDPOINT = prevEndpoint as any
        }
    })

    it('sendToTelegram falls back when forward create fails', async () => {
        const sender = new TelegramSender(mockInstance)
        vi.mocked(db.forwardMultiple.create).mockRejectedValueOnce(new Error('fail'))
        const msg: any = {
            sender: { id: 'q1', name: 'QQUser' },
            content: [{ type: 'forward', data: { id: 'f1', messages: ['m1'] } }]
        }
        await sender.sendToTelegram(mockChat, msg, { id: 1 }, undefined, '00')
        expect(mockChat.sendMessage).toHaveBeenCalledWith('[转发消息x1]', expect.any(Object))
    })
})
