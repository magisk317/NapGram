import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HelpCommandHandler } from '../HelpCommandHandler';
import type { CommandContext } from '../CommandContext';
import type { UnifiedMessage } from '../../../../domain/message';
import type { IQQClient } from '../../../../infrastructure/clients/qq';

// Mock QQ Client
const createMockQQClient = (): IQQClient => ({
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    recallMessage: vi.fn(),
    getMessage: vi.fn(),
    getFriendList: vi.fn(),
    getGroupList: vi.fn(),
    getGroupMemberList: vi.fn(),
    getGroupMemberInfo: vi.fn(),
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
    getChat: vi.fn().mockResolvedValue({
        sendMessage: vi.fn().mockResolvedValue({}),
    }),
} as any);

// Mock Command Registry
const createMockRegistry = () => ({
    prefix: '/',
    getAll: vi.fn().mockReturnValue(
        new Map([
            [
                'bind',
                {
                    name: 'bind',
                    description: '绑定 QQ 群与 TG 聊天',
                    handler: vi.fn(),
                    aliases: ['b'],
                    adminOnly: false,
                },
            ],
            [
                'b',
                {
                    name: 'bind',
                    description: '绑定 QQ 群与 TG 聊天',
                    handler: vi.fn(),
                    aliases: ['b'],
                    adminOnly: false,
                },
            ],
            [
                'unbind',
                {
                    name: 'unbind',
                    description: '解绑绑定关系',
                    handler: vi.fn(),
                    aliases: [],
                    adminOnly: false,
                },
            ],
            [
                'status',
                {
                    name: 'status',
                    description: '查看机器人状态',
                    handler: vi.fn(),
                    aliases: [],
                    adminOnly: false,
                },
            ],
            [
                'ban',
                {
                    name: 'ban',
                    description: '禁言用户',
                    handler: vi.fn(),
                    aliases: [],
                    adminOnly: true,
                },
            ],
        ])
    ),
});


// Mock Command Context
const createMockContext = (qqClient: IQQClient, tgBot: any): CommandContext => ({
    qqClient,
    tgBot,
    registry: createMockRegistry() as any,
    permissionChecker: {} as any,
    stateManager: {} as any,
    instance: {
        id: 1,
        owner: '123456',
        forwardPairs: {} as any,
    } as any,
    replyTG: vi.fn().mockResolvedValue(undefined),
    extractThreadId: vi.fn().mockReturnValue(undefined),
} as any);

// Helper to create UnifiedMessage
const createMessage = (
    text: string,
    senderId: string = '999999',
    chatId: string = '777777'
): UnifiedMessage => ({
    id: '12345',
    platform: 'telegram',
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

describe('HelpCommandHandler', () => {
    let handler: HelpCommandHandler;
    let mockQQClient: IQQClient;
    let mockTgBot: any;
    let mockContext: CommandContext;

    beforeEach(() => {
        mockQQClient = createMockQQClient();
        mockTgBot = createMockTgBot();
        mockContext = createMockContext(mockQQClient, mockTgBot);
        handler = new HelpCommandHandler(mockContext);
    });

    describe('Help Message Display', () => {
        it('should display help message with all commands', async () => {
            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            expect(mockContext.registry.getAll).toHaveBeenCalled();
            expect(mockContext.replyTG).toHaveBeenCalledWith(
                '777777',
                expect.stringContaining('可用命令'),
                undefined
            );
        });

        it('should include command names in help message', async () => {
            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            const callArg = vi.mocked(mockContext.replyTG).mock.calls[0][1];
            expect(callArg).toContain('/bind');
            expect(callArg).toContain('/unbind');
            expect(callArg).toContain('/status');
        });

        it('should include command descriptions', async () => {
            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            const callArg = vi.mocked(mockContext.replyTG).mock.calls[0][1];
            expect(callArg).toContain('绑定 QQ 群与 TG 聊天');
            expect(callArg).toContain('解绑绑定关系');
            expect(callArg).toContain('查看机器人状态');
        });

        it('should distinguish admin commands', async () => {
            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            const callArg = vi.mocked(mockContext.replyTG).mock.calls[0][1];
            // Admin commands should be marked with [管理员]
            expect(callArg).toContain('/ban');
            expect(callArg).toContain('[管理员]');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty command registry', async () => {
            mockContext.registry.getAll = vi.fn().mockReturnValue(new Map());

            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            expect(mockContext.replyTG).toHaveBeenCalled();
        });

        it('should handle commands with no description', async () => {
            mockContext.registry.getAll = vi.fn().mockReturnValue(
                new Map([
                    [
                        'test',
                        {
                            name: 'test',
                            description: '',
                            handler: vi.fn(),
                            aliases: [],
                            adminOnly: false,
                        },
                    ],
                ])
            );

            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            expect(mockContext.replyTG).toHaveBeenCalled();
        });
    });

    describe('Arguments Handling', () => {
        it('should work with no arguments', async () => {
            const msg = createMessage('/help', '999999', '777777');
            await handler.execute(msg, []);

            expect(mockContext.replyTG).toHaveBeenCalled();
        });

        it('should ignore extra arguments', async () => {
            const msg = createMessage('/help something', '999999', '777777');
            await handler.execute(msg, ['something']);

            expect(mockContext.replyTG).toHaveBeenCalled();
        });
    });

    describe('Platform Support', () => {
        it('should work from any platform', async () => {
            const msg: UnifiedMessage = {
                id: '12345',
                platform: 'qq',
                sender: {
                    id: '999999',
                    name: 'TestUser',
                },
                chat: {
                    id: '888888',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: '/help' },
                    },
                ],
                timestamp: Date.now(),
                metadata: {},
            };

            await handler.execute(msg, []);

            expect(mockContext.replyTG).toHaveBeenCalled();
        });
    });
});
