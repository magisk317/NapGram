import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecallFeature } from '../recall/RecallFeature';
import type { RecallEvent } from '../../domain/message';
import type { IQQClient } from '../../infrastructure/clients/qq';

// Mock database
vi.mock('../../domain/models/db', () => ({
    default: {
        message: {
            findFirst: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import db from '../../domain/models/db';

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

const createMockTgBot = () => ({
    deleteMessages: vi.fn(),
    getChat: vi.fn().mockResolvedValue({
        deleteMessages: vi.fn().mockResolvedValue(undefined),
    }),
    addDeletedMessageEventHandler: vi.fn(),
    removeDeletedMessageEventHandler: vi.fn(),
} as any);

const createMockInstance = () => ({
    id: 0,
    owner: 123456,
} as any);

describe('RecallFeature', () => {
    let recallFeature: RecallFeature;
    let mockQQClient: IQQClient;
    let mockTgBot: any;
    let mockInstance: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockQQClient = createMockQQClient();
        mockTgBot = createMockTgBot();
        mockInstance = createMockInstance();

        recallFeature = new RecallFeature(
            mockInstance,
            mockTgBot,
            mockQQClient
        );
    });

    describe('QQ Message Recall', () => {
        it('should handle QQ message recall and delete TG message', async () => {
            const recallEvent: RecallEvent = {
                messageId: '12345',
                chatId: '789',
                operatorId: '456',
                timestamp: Date.now(),
            };

            const mockDbEntry = {
                id: 1,
                qqRoomId: 789,
                seq: '12345',
                tgChatId: BigInt(-100123),
                tgMsgId: 999,
                deleted: false,
            };

            (db.message.findFirst as any).mockResolvedValue(mockDbEntry);
            (db.message.update as any).mockResolvedValue({ ...mockDbEntry, deleted: true });

            const mockChat = {
                deleteMessages: vi.fn().mockResolvedValue(undefined),
            };
            mockTgBot.getChat.mockResolvedValue(mockChat);

            await recallFeature['handleQQRecall'](recallEvent);

            expect(db.message.findFirst).toHaveBeenCalledWith({
                where: {
                    instanceId: mockInstance.id,
                    qqRoomId: BigInt(789),
                    seq: 12345,
                },
            });

            expect(mockTgBot.getChat).toHaveBeenCalledWith(Number(mockDbEntry.tgChatId));
            expect(mockChat.deleteMessages).toHaveBeenCalledWith([mockDbEntry.tgMsgId]);

            expect(db.message.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { ignoreDelete: true },
            });
        });

        it('should handle QQ recall when no TG message found', async () => {
            const recallEvent: RecallEvent = {
                messageId: '12345',
                chatId: '789',
                operatorId: '456',
                timestamp: Date.now(),
            };

            (db.message.findFirst as any).mockResolvedValue(null);

            await recallFeature['handleQQRecall'](recallEvent);

            expect(db.message.findFirst).toHaveBeenCalled();
            expect(mockTgBot.deleteMessages).not.toHaveBeenCalled();
            expect(db.message.update).not.toHaveBeenCalled();
        });

        it('should handle TG deletion error gracefully', async () => {
            const recallEvent: RecallEvent = {
                messageId: '12345',
                chatId: '789',
                operatorId: '456',
                timestamp: Date.now(),
            };

            const mockDbEntry = {
                id: 1,
                qqRoomId: 789,
                seq: '12345',
                tgChatId: BigInt(-100123),
                tgMsgId: 999,
                deleted: false,
            };

            (db.message.findFirst as any).mockResolvedValue(mockDbEntry);
            mockTgBot.deleteMessages.mockRejectedValue(new Error('TG API Error'));

            await expect(
                recallFeature['handleQQRecall'](recallEvent)
            ).resolves.not.toThrow();

            expect(db.message.update).toHaveBeenCalled();
        });
    });

    describe('TG Message Recall', () => {
        it('should handle TG message recall and recall QQ message', async () => {
            const mockDbEntry = {
                id: 1,
                qqRoomId: 789,
                seq: '12345',
                tgChatId: BigInt(-100123),
                tgMsgId: 999,
                deleted: false,
            };

            (db.message.findFirst as any).mockResolvedValue(mockDbEntry);
            (db.message.update as any).mockResolvedValue({ ...mockDbEntry, deleted: true });

            await recallFeature.handleTGRecall(-100123, 999);

            expect(db.message.findFirst).toHaveBeenCalledWith({
                where: {
                    instanceId: mockInstance.id,
                    tgChatId: BigInt(-100123),
                    tgMsgId: 999,
                },
            });

            expect(mockQQClient.recallMessage).toHaveBeenCalledWith('12345');

            expect(db.message.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { ignoreDelete: true },
            });
        });

        it('should handle TG recall when no QQ message found', async () => {
            (db.message.findFirst as any).mockResolvedValue(null);

            await recallFeature.handleTGRecall(-100123, 999);

            expect(db.message.findFirst).toHaveBeenCalled();
            expect(mockQQClient.recallMessage).not.toHaveBeenCalled();
            expect(db.message.update).not.toHaveBeenCalled();
        });

        it('should handle QQ recall error gracefully', async () => {
            const mockDbEntry = {
                id: 1,
                qqRoomId: 789,
                seq: '12345',
                tgChatId: BigInt(-100123),
                tgMsgId: 999,
                deleted: false,
            };

            (db.message.findFirst as any).mockResolvedValue(mockDbEntry);
            (mockQQClient.recallMessage as any).mockRejectedValue(new Error('QQ API Error'));

            await expect(
                recallFeature.handleTGRecall(-100123, 999)
            ).resolves.not.toThrow();

            expect(db.message.update).toHaveBeenCalled();
        });
    });

    describe('Lifecycle', () => {
        it('should setup listeners on creation', () => {
            expect(mockQQClient.on).toHaveBeenCalledWith('recall', expect.any(Function));
        });

        it('should cleanup on destroy', () => {
            recallFeature.destroy();

            expect(mockQQClient.off).toHaveBeenCalledWith('recall', expect.any(Function));
        });
    });
});
