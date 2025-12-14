import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QQInteractionCommandHandler } from '../QQInteractionCommandHandler';
import type { CommandContext } from '../CommandContext';
import type { UnifiedMessage } from '../../../../domain/message';
import type { IQQClient } from '../../../../infrastructure/clients/qq';

// Mock QQ Client
const createMockQQClient = (): IQQClient => ({
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn(),
    recallMessage: vi.fn(),
    getMessage: vi.fn(),
    getFriendList: vi.fn(),
    getGroupList: vi.fn(),
    getGroupMemberList: vi.fn(),
    getGroupMemberInfo: vi.fn().mockResolvedValue({
        uin: '123456',
        nickname: 'TestBot',
        card: 'BotCard',
    }),
    getFriendInfo: vi.fn(),
    getGroupInfo: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    destroy: vi.fn(),
} as any);

// Mock Telegram Bot
const createMockTgBot = () => ({
    sendMessage: vi.fn().mockResolvedValue({}),
} as any);

// Mock Command Context
const createMockContext = (qqClient: IQQClient, tgBot: any): CommandContext => ({
    qqClient,
    tgBot,
    registry: {} as any,
    permissionChecker: {} as any,
    stateManager: {} as any,
    instance: {
        id: 1,
        owner: '123456',
        forwardPairs: {
            findByTG: vi.fn().mockReturnValue({
                qqRoomId: '888888',
                tgChatId: '777777',
            }),
            findByQQ: vi.fn(),
            find: vi.fn(),
            add: vi.fn(),
            remove: vi.fn(),
        },
    } as any,
    replyTG: vi.fn().mockResolvedValue(undefined),
    extractThreadId: vi.fn().mockReturnValue(undefined),
} as any);

// Helper to create UnifiedMessage
const createMessage = (
    text: string,
    senderId: string = '999999',
    chatId: string = '777777',
    platform: 'telegram' | 'qq' = 'telegram'
): UnifiedMessage => ({
    id: '12345',
    platform,
    sender: {
        id: senderId,
        name: 'TestUser',
    },
    chat: {
        id: chatId,
        type: 'group',
    },
    content: [
        {
            type: 'text',
            data: { text },
        },
    ],
    timestamp: Date.now(),
    metadata: {},
});

describe('QQInteractionCommandHandler', () => {
    let handler: QQInteractionCommandHandler;
    let mockQQClient: IQQClient;
    let mockTgBot: any;
    let mockContext: CommandContext;

    beforeEach(() => {
        mockQQClient = createMockQQClient();
        mockTgBot = createMockTgBot();
        mockContext = createMockContext(mockQQClient, mockTgBot);
        handler = new QQInteractionCommandHandler(mockContext);
    });

    describe('Platform Filtering', () => {
        it('should only process commands from Telegram platform', async () => {
            const msg = createMessage('/poke', '999999', '777777', 'qq');
            await handler.execute(msg, [], 'poke');

            expect(mockContext.replyTG).not.toHaveBeenCalled();
        });
    });

    describe('No Binding Scenario', () => {
        it('should show error when chat is not bound', async () => {
            mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue(null);

            const msg = createMessage('/poke', '999999', '777777');
            await handler.execute(msg, [], 'poke');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('未绑定任何 QQ 群'),
                undefined
            );
        });
    });

    describe('/poke command', () => {
        it('should show not implemented message', async () => {
            const msg = createMessage('/poke', '999999', '777777');
            await handler.execute(msg, [], 'poke');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('暂未实现'),
                undefined
            );
        });

        it('should mention NapCat API requirement', async () => {
            const msg = createMessage('/poke', '999999', '777777');
            await handler.execute(msg, [], 'poke');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('NapCat'),
                undefined
            );
        });

        it('should accept optional target UIN parameter', async () => {
            const msg = createMessage('/poke 123456', '999999', '777777');
            await handler.execute(msg, ['123456'], 'poke');

            expect(mockContext.replyTG).toHaveBeenCalled();
        });
    });

    describe('/nick command', () => {
        it('should display current nick when no arguments provided', async () => {
            const msg = createMessage('/nick', '999999', '777777');
            await handler.execute(msg, [], 'nick');

            expect(mockQQClient.getGroupMemberInfo).toHaveBeenCalledWith('888888', '123456');
            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('当前群名片'),
                undefined
            );
        });

        it('should show card if available', async () => {
            const msg = createMessage('/nick', '999999', '777777');
            await handler.execute(msg, [], 'nick');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('BotCard'),
                undefined
            );
        });

        it('should fallback to nickname if card is not set', async () => {
            vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValue({
                uin: '123456',
                nickname: 'TestBot',
                card: null,
            } as any);

            const msg = createMessage('/nick', '999999', '777777');
            await handler.execute(msg, [], 'nick');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('TestBot'),
                undefined
            );
        });

        it('should show "未设置" if neither card nor nickname available', async () => {
            vi.mocked(mockQQClient.getGroupMemberInfo).mockResolvedValue({
                uin: '123456',
                nickname: null,
                card: null,
            } as any);

            const msg = createMessage('/nick', '999999', '777777');
            await handler.execute(msg, [], 'nick');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('未设置'),
                undefined
            );
        });

        it('should show not implemented when trying to set nickname', async () => {
            const msg = createMessage('/nick NewNick', '999999', '777777');
            await handler.execute(msg, ['NewNick'], 'nick');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('暂未实现'),
                undefined
            );
        });

        it('should handle multi-word nicknames', async () => {
            const msg = createMessage('/nick New Bot Nick', '999999', '777777');
            await handler.execute(msg, ['New', 'Bot', 'Nick'], 'nick');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('暂未实现'),
                undefined
            );
        });

        it('should handle error when getting member info fails', async () => {
            vi.mocked(mockQQClient.getGroupMemberInfo).mockRejectedValue(
                new Error('Network error')
            );

            const msg = createMessage('/nick', '999999', '777777');
            await handler.execute(msg, [], 'nick');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('失败'),
                undefined
            );
        });
    });

    describe('/mute command', () => {
        it('should show usage when no arguments provided', async () => {
            const msg = createMessage('/mute', '999999', '777777');
            await handler.execute(msg, [], 'mute');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('用法'),
                undefined
            );
        });

        it('should show usage when only one argument provided', async () => {
            const msg = createMessage('/mute 123456', '999999', '777777');
            await handler.execute(msg, ['123456'], 'mute');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('用法'),
                undefined
            );
        });

        it('should reject non-numeric duration', async () => {
            const msg = createMessage('/mute 123456 abc', '999999', '777777');
            await handler.execute(msg, ['123456', 'abc'], 'mute');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('必须是非负整数'),
                undefined
            );
        });

        it('should reject negative duration', async () => {
            const msg = createMessage('/mute 123456 -60', '999999', '777777');
            await handler.execute(msg, ['123456', '-60'], 'mute');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('必须是非负整数'),
                undefined
            );
        });

        it('should show not implemented for valid inputs', async () => {
            const msg = createMessage('/mute 123456 600', '999999', '777777');
            await handler.execute(msg, ['123456', '600'], 'mute');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('暂未实现'),
                undefined
            );
        });

        it('should accept zero duration', async () => {
            const msg = createMessage('/mute 123456 0', '999999', '777777');
            await handler.execute(msg, ['123456', '0'], 'mute');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('暂未实现'),
                undefined
            );
        });
    });

    describe('Thread Support', () => {
        it('should use extracted thread ID', async () => {
            vi.mocked(mockContext.extractThreadId).mockReturnValue(12345);

            const msg = createMessage('/poke', '999999', '777777');
            await handler.execute(msg, [], 'poke');

            expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
                '777777',
                12345,
                true
            );
        });

        it('should reply to correct thread', async () => {
            vi.mocked(mockContext.extractThreadId).mockReturnValue(54321);

            const msg = createMessage('/poke', '999999', '777777');
            await handler.execute(msg, [], 'poke');

            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.any(String),
                54321
            );
        });
    });
});
