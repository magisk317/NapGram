import { BaseConverter } from './BaseConverter';
import type { UnifiedMessage, MessageContent } from '../types';
import { Message } from '@mtcute/core';

export class TelegramConverter extends BaseConverter {
    /**
     * 从 Telegram 消息转换为统一格式
     */
    fromTelegram(tgMsg: Message): UnifiedMessage {
        this.logger.debug(tgMsg.id, 'Converting from Telegram:');

        const content: MessageContent[] = [];
        const text = tgMsg.text;

        if (text) {
            content.push({
                type: 'text',
                data: { text },
            });
        }

        const media = tgMsg.media;

        if (media) {
            if (media.type === 'photo') {
                content.push({
                    type: 'image',
                    data: {
                        file: media, // mtcute Photo object
                        // url: media.full?.url, // mtcute doesn't expose URL directly for private media
                    },
                });
            } else if (media.type === 'video') {
                content.push({
                    type: 'video',
                    data: {
                        file: media,
                        duration: media.duration,
                    },
                });
            } else if (media.type === 'voice') {
                content.push({
                    type: 'audio',
                    data: {
                        file: media,
                        duration: media.duration,
                    },
                });
            } else if (media.type === 'audio') {
                content.push({
                    type: 'audio',
                    data: {
                        file: media,
                        duration: media.duration,
                    },
                });
            } else if (media.type === 'document') {
                // Check if it's a GIF (mime type)
                if (media.mimeType === 'image/gif') {
                    content.push({
                        type: 'image',
                        data: {
                            file: media,
                            isSpoiler: false,
                        },
                    });
                } else {
                    content.push({
                        type: 'file',
                        data: {
                            file: media,
                            filename: media.fileName || 'file',
                            size: media.fileSize,
                        },
                    });
                }
            } else if (media.type === 'sticker') {
                // Treat sticker as image (or file if animated?)
                // For now, let's treat as image/file
                content.push({
                    type: 'image',
                    data: {
                        file: media,
                    }
                });
            }
        }

        if (tgMsg.replyToMessage) {
            const reply = tgMsg.replyToMessage;
            content.push({
                type: 'reply',
                data: {
                    messageId: String(reply.id),
                    senderId: String((reply.sender as any)?.id || ''),
                    senderName: reply.sender?.displayName || 'Unknown',
                    text: (reply as any).text || '',
                },
            });
        }

        const senderId = String(tgMsg.sender?.id ?? 'unknown');
        const senderName = tgMsg.sender?.displayName || 'Unknown';
        const chatId = String(tgMsg.chat?.id ?? 'unknown');
        const timestamp = tgMsg.date.getTime();

        return {
            id: String(tgMsg.id),
            platform: 'telegram',
            sender: {
                id: senderId,
                name: senderName,
            },
            chat: {
                id: chatId,
                type: (tgMsg.chat?.type as string) === 'private' ? 'private' : 'group',
            },
            content,
            timestamp,
            metadata: {
                raw: tgMsg,
            },
        };
    }
}
