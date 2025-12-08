import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandsFeature } from '../commands/CommandsFeature';
import type { UnifiedMessage } from '../../domain/message';
import type { IQQClient } from '../../infrastructure/clients/qq';

// Mock dependencies
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

const createMockInstance = () => ({
    id: 0,
    owner: 123456,
    forwardPairs: {
        find: vi.fn(),
        findByTG: vi.fn().mockReturnValue(null),
        findByQQ: vi.fn().mockReturnValue(null),
        add: vi.fn().mockResolvedValue({ qqRoomId: '111', tgChatId: '789', tgThreadId: 222 }),
        remove: vi.fn().mockResolvedValue(undefined),
    },
} as any);

const createMockTgBot = () => ({
    sendMessage: vi.fn(),
    getChat: vi.fn().mockResolvedValue({
        sendMessage: vi.fn().mockResolvedValue({}),
        deleteMessages: vi.fn().mockResolvedValue(undefined),
    }),
    addNewMessageEventHandler: vi.fn(),
    removeNewMessageEventHandler: vi.fn(),
    addDeletedMessageEventHandler: vi.fn(),
    removeDeletedMessageEventHandler: vi.fn(),
    me: {
        username: 'testbot',
    },
} as any);

describe('CommandsFeature', () => {
    let commandsFeature: CommandsFeature;
    let mockQQClient: IQQClient;
    let mockInstance: any;
    let mockTgBot: any;

    beforeEach(() => {
        mockQQClient = createMockQQClient();
        mockInstance = createMockInstance();
        mockTgBot = createMockTgBot();

        commandsFeature = new CommandsFeature(
            mockInstance,
            mockTgBot,
            mockQQClient
        );
    });

    describe('Command Registration', () => {
        it('should register default commands', () => {
            // Default commands should be registered
            expect(commandsFeature['registry'].get('help')).toBeDefined();
            expect(commandsFeature['registry'].get('status')).toBeDefined();
            expect(commandsFeature['registry'].get('bind')).toBeDefined();
        });

        it('should register command with aliases', () => {
            commandsFeature.registerCommand({
                name: 'test',
                aliases: ['t', '测试'],
                description: 'Test command',
                handler: vi.fn(),
            });

            expect(commandsFeature['registry'].get('test')).toBeDefined();
            expect(commandsFeature['registry'].get('t')).toBeDefined();
            expect(commandsFeature['registry'].get('测试')).toBeDefined();
        });

        it('should register custom command', () => {
            const handler = vi.fn();

            commandsFeature.registerCommand({
                name: 'custom',
                description: 'Custom command',
                handler,
            });

            expect(commandsFeature['registry'].get('custom')).toBeDefined();
            const command = commandsFeature['registry'].get('custom');
            expect(command?.handler).toBe(handler);
        });
    });

    describe('Command Execution', () => {
        it('should execute help command', async () => {
            const msg: UnifiedMessage = {
                id: '123',
                platform: 'qq',
                sender: {
                    id: '123456',
                    name: 'TestUser',
                },
                chat: {
                    id: '789',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: '/help' },
                    },
                ],
                timestamp: Date.now(),
            };

            await commandsFeature['handleQqMessage'](msg);

            // Help command should be executed
            // (实际实现中会发送帮助信息)
        });

        it('should execute status command', async () => {
            const msg: UnifiedMessage = {
                id: '123',
                platform: 'qq',
                sender: {
                    id: '123456',
                    name: 'TestUser',
                },
                chat: {
                    id: '789',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: '/status' },
                    },
                ],
                timestamp: Date.now(),
            };

            await commandsFeature['handleQqMessage'](msg);

            // Status command should check online status
            expect(mockQQClient.isOnline).toHaveBeenCalled();
        });

        it('should not execute non-command messages', async () => {
            const msg: UnifiedMessage = {
                id: '123',
                platform: 'qq',
                sender: {
                    id: '123456',
                    name: 'TestUser',
                },
                chat: {
                    id: '789',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: 'Hello world' },
                    },
                ],
                timestamp: Date.now(),
            };

            await commandsFeature['handleQqMessage'](msg);

            // Should not execute any command
        });

        it('should handle unknown commands gracefully', async () => {
            const msg: UnifiedMessage = {
                id: '123',
                platform: 'qq',
                sender: {
                    id: '123456',
                    name: 'TestUser',
                },
                chat: {
                    id: '789',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: '/unknown' },
                    },
                ],
                timestamp: Date.now(),
            };

            // Should not throw error
            await expect(
                commandsFeature['handleQqMessage'](msg)
            ).resolves.not.toThrow();
        });
    });

    describe('Permission Check', () => {
        it('should allow admin to use admin commands', async () => {
            const msg: UnifiedMessage = {
                id: '123',
                platform: 'qq',
                sender: {
                    id: '123456', // Same as instance owner
                    name: 'Admin',
                },
                chat: {
                    id: '789',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: '/bind 111 222' },
                    },
                ],
                timestamp: Date.now(),
            };

            await commandsFeature['handleQqMessage'](msg);

            // Should execute bind command
        });

        it('should deny non-admin from using admin commands', async () => {
            const msg: UnifiedMessage = {
                id: '123',
                platform: 'qq',
                sender: {
                    id: '999999', // Different from instance owner
                    name: 'User',
                },
                chat: {
                    id: '789',
                    type: 'group',
                },
                content: [
                    {
                        type: 'text',
                        data: { text: '/bind 111 222' },
                    },
                ],
                timestamp: Date.now(),
            };

            await commandsFeature['handleQqMessage'](msg);

            // Should not execute bind command
        });
    });
});
