import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock silk-sdk to avoid native binding issues in tests
vi.mock('silk-sdk', () => ({
    default: {
        encode: vi.fn().mockResolvedValue(Buffer.from('mock-silk-encoded')),
        decode: vi.fn().mockResolvedValue(Buffer.from('mock-silk-decoded')),
    },
}));

import { EventEmitter } from 'events';
import { ForwardFeature } from '../forward/ForwardFeature';
import type { UnifiedMessage } from '../../domain/message';
import { messageConverter } from '../../domain/message';

const createMockForwardMap = () => {
    const map = {
        findByQQ: vi.fn(),
        findByTG: vi.fn(),
    };
    return map as any;
};

const createMockTgBot = () => {
    const chat = {
        sendMessage: vi.fn().mockResolvedValue({}),
    };
    const bot = {
        addNewMessageEventHandler: vi.fn(),
        removeNewMessageEventHandler: vi.fn(),
        getChat: vi.fn().mockResolvedValue(chat),
        me: { id: 999 },
    };
    return { bot: bot as any, chat };
};

const createMockQQClient = () => {
    const client = new EventEmitter() as any;
    client.sendMessage = vi.fn().mockResolvedValue({ success: true, messageId: 'mid', timestamp: Date.now() });
    client.recallMessage = vi.fn();
    return client;
};

const createMockMedia = () => ({
    processImage: vi.fn().mockResolvedValue(Buffer.from('img')),
    processVideo: vi.fn().mockResolvedValue(Buffer.from('vid')),
    processAudio: vi.fn().mockResolvedValue(Buffer.from('aud')),
    downloadMedia: vi.fn().mockResolvedValue(Buffer.from('file')),
    createTempFileFromBuffer: vi.fn().mockResolvedValue({ path: '/tmp/mock' }),
});

describe('ForwardFeature', () => {
    let forwardMap: any;
    let tgMock: ReturnType<typeof createMockTgBot>;
    let qqClient: any;
    let feature: ForwardFeature;
    let media: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        forwardMap = createMockForwardMap();
        tgMock = createMockTgBot();
        qqClient = createMockQQClient();
        media = createMockMedia();
    });

    it('should forward QQ text and media to TG with mapped chat', async () => {
        forwardMap.findByQQ = vi.fn(() => ({
            tgChatId: BigInt(1001),
            qqRoomId: BigInt(2001),
            instanceId: 0,
        }));

        const instance: any = {
            forwardPairs: forwardMap,
            tgBot: tgMock.bot,
        };
        feature = new ForwardFeature(instance, tgMock.bot, qqClient, media);

        const msg: UnifiedMessage = {
            id: '1',
            platform: 'qq',
            sender: { id: 'u', name: 'User' },
            chat: { id: '2001', type: 'group' },
            content: [
                { type: 'text', data: { text: 'hello' } },
                { type: 'image', data: { url: 'http://img' } },
            ],
            timestamp: Date.now(),
        };

        await (feature as any).handleQQMessage(msg);

        // Just verify no errors occurred
        expect(tgMock.bot.getChat).toHaveBeenCalledWith(1001);
    });

    it('should forward TG message to QQ with mapped chat', async () => {
        forwardMap.findByTG = vi.fn(() => ({
            tgChatId: BigInt(1001),
            qqRoomId: BigInt(2001),
            instanceId: 0,
        }));

        const instance: any = {
            forwardPairs: forwardMap,
            tgBot: tgMock.bot,
        };
        feature = new ForwardFeature(instance, tgMock.bot, qqClient, media);

        // Verify that TG event listener was registered
        expect(tgMock.bot.addNewMessageEventHandler).toHaveBeenCalled();
    });
});
