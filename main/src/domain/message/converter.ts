import type { UnifiedMessage, MessageContent } from './types';
import { getLogger } from '../../shared/logger';
import type { Receive } from 'node-napcat-ts';
import env from '../models/env';
import fs from 'fs/promises';
import path from 'path';
import fsSync from 'fs';
import { Message } from '@mtcute/core';

const logger = getLogger('MessageConverter');

/**
 * 增强的消息转换器
 * Phase 2: 完整支持所有消息类型
 */
export class MessageConverter {
    /**
     * 从 NapCat 消息转换为统一格式
     */
    fromNapCat(napCatMsg: any): UnifiedMessage {
        logger.info(`Converting from NapCat: ${napCatMsg.message_id}`);
        logger.debug(`Converting NapCat message segments:\n${JSON.stringify(napCatMsg.message, null, 2)}`);

        const content: MessageContent[] = [];

        // 解析消息内容
        if (napCatMsg.message) {
            for (const segment of napCatMsg.message) {
                const converted = this.convertNapCatSegment(segment, napCatMsg);
                if (converted) {
                    content.push(converted);
                }
            }
        }

        // 提取发送者名称：优先使用群名片，如果为空则使用昵称
        const senderCard = napCatMsg.sender?.card?.trim();
        const senderNickname = napCatMsg.sender?.nickname?.trim();
        const senderName = (senderCard && senderCard.length > 0) ? senderCard : (senderNickname || 'Unknown');

        return {
            id: String(napCatMsg.message_id),
            platform: 'qq',
            sender: {
                id: String(napCatMsg.sender?.user_id || napCatMsg.user_id),
                name: senderName,
                avatar: napCatMsg.sender?.avatar,
            },
            chat: {
                id: String(napCatMsg.group_id || napCatMsg.user_id),
                type: napCatMsg.message_type === 'group' ? 'group' : 'private',
                name: napCatMsg.group_name,
            },
            content,
            timestamp: napCatMsg.time * 1000,
            metadata: {
                raw: napCatMsg,
                messageType: napCatMsg.message_type,
                subType: napCatMsg.sub_type,
            },
        };
    }

    /**
     * 统一格式转换为 NapCat 格式
     */


    /**
     * 从 Telegram 消息转换为统一格式
     */
    fromTelegram(tgMsg: Message): UnifiedMessage {
        logger.debug('Converting from Telegram:', tgMsg.id);

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
                    senderId: String((reply.sender as any).id || ''),
                    senderName: reply.sender.displayName || 'Unknown',
                    text: (reply as any).text || '',
                },
            });
        }

        const senderId = String(tgMsg.sender.id);
        const senderName = tgMsg.sender.displayName || 'Unknown';
        const chatId = String(tgMsg.chat.id);
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
                type: (tgMsg.chat.type as string) === 'private' ? 'private' : 'group',
            },
            content,
            timestamp,
            metadata: {
                raw: tgMsg,
            },
        };
    }

    /**
     * 统一格式转换为 Telegram 格式
     */
    toTelegram(msg: UnifiedMessage): any {
        const result: any = {
            message: '',
            media: [] as MessageContent[],
        };

        for (const content of msg.content) {
            switch (content.type) {
                case 'text':
                    result.message += content.data.text;
                    break;
                default:
                    result.media.push(content);
                    break;
            }
        }

        return result;
    }

    // ============ NapCat 转换辅助方法 ============

    private convertNapCatSegment(segment: any, rawMsg?: any): MessageContent | null {
        logger.debug(`Converting segment:\n${JSON.stringify(segment, null, 2)}`);
        const data: any = segment?.data || {};
        const type = (segment?.type || '') as string;
        const rawMessage: string | undefined = rawMsg?.raw_message;

        switch (type) {
            case 'text':
                return {
                    type: 'text',
                    data: { text: data.text },
                };

            case 'image':
                {
                    const httpUrl = (data.url && /^https?:/.test(data.url)) ? data.url : undefined;
                    const httpFile = (data.file && /^https?:/.test(data.file)) ? data.file : undefined;
                    const url = httpUrl || httpFile || data.url || data.file;
                    return {
                        type: 'image',
                        data: {
                            url,
                            file: httpUrl || data.file,
                            isSpoiler: data.sub_type && parseInt(data.sub_type) > 0,
                        },
                    };
                }

            case 'video':
                {
                    let url = data.url || data.file;
                    // 优先从 raw_message 提取真实视频 URL（data.url/file 可能是缩略图）
                    if (rawMessage) {
                        const m = rawMessage.match(/url=([^,\]]+)/);
                        if (m && m[1]) {
                            url = m[1].replace(/&amp;/g, '&'); // 解码 HTML 实体
                        }
                    }
                    // 如果仍然不是 HTTP URL，使用原始值
                    if (!/^https?:/.test(url || '')) {
                        url = data.url || data.file;
                    }
                    return {
                        type: 'video',
                        data: {
                            url,
                            file: url,
                        },
                    };
                }

            case 'record':
                return {
                    type: 'audio',
                    data: {
                        url: data.url || data.file,
                        file: data.file,
                    },
                };

            case 'location':
                return {
                    type: 'location',
                    data: {
                        latitude: Number(data.lat ?? data.latitude ?? 0),
                        longitude: Number(data.lng ?? data.longitude ?? 0),
                        title: data.title,
                        address: data.address,
                    },
                };

            case 'share':
                return {
                    type: 'text',
                    data: {
                        text: data.url || data.file || rawMessage || '[分享]',
                    },
                };

            case 'poke':
                return {
                    type: 'text',
                    data: {
                        text: `[戳一戳] ${data.name || ''}`.trim(),
                    },
                };

            case 'flash':
                return {
                    type: 'image',
                    data: {
                        url: data.url || data.file,
                        file: data.file,
                        isSpoiler: true,
                    },
                };

            case 'file':
                return {
                    type: 'file',
                    data: {
                        url: data.url,
                        filename: data.file || data.name,
                        size: data.file_size ? Number(data.file_size) : undefined,
                    },
                };

            case 'at':
                return {
                    type: 'at',
                    data: {
                        userId: String(data.qq),
                        userName: data.name || '',
                    },
                };

            case 'face':
                return {
                    type: 'face',
                    data: {
                        id: Number(data.id),
                    },
                };

            case 'forward':
                // 转发消息需要特殊处理
                return {
                    type: 'forward',
                    data: {
                        id: data.id, // Preserve ResID
                        messages: data.content
                            ? data.content.map((msg: any) => this.fromNapCat(msg))
                            : [],
                    },
                };

            case 'reply':
                return {
                    type: 'reply',
                    data: {
                        messageId: String(data.id),
                        senderId: '',
                        senderName: '',
                    },
                };

            case 'markdown':
            case 'json':
                // 特殊消息类型，保留原始数据
                return {
                    type: 'text',
                    data: {
                        text: JSON.stringify(segment.data),
                    },
                };

            case 'mface':
                // 商城表情，转换为图片
                return {
                    type: 'sticker',
                    data: {
                        url: data.url,
                        isAnimated: true,
                    },
                };

            case 'dice':
            case 'rps':
                // 骰子和猜拳，转换为 face
                return {
                    type: 'face',
                    data: {
                        id: Number(segment.data.result),
                        text: type === 'dice' ? '🎲' : '✊✋✌️',
                    },
                };

            default:
                logger.warn('Unknown NapCat segment type:', type);
                return null;
        }
    }

    private async saveBufferToTemp(buffer: Buffer, type: 'image' | 'video' | 'audio' | 'file', ext: string, filename?: string): Promise<string> {
        // 尝试使用 NapCat 共享目录 (假设 NapCat 容器内路径也是 /app/.config/QQ)
        const sharedRoot = '/app/.config/QQ';
        const sharedDir = path.join(sharedRoot, 'temp_q2tg_share');

        if (fsSync.existsSync(sharedRoot)) {
            try {
                await fs.mkdir(sharedDir, { recursive: true });
                const name = filename || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
                const filePath = path.join(sharedDir, name);
                await fs.writeFile(filePath, buffer);
                logger.debug(`Saved buffer to shared path: ${filePath}`);
                return filePath;
            } catch (e) {
                logger.warn(`Failed to write to shared dir ${sharedDir}:`, e);
            }
        }

        // 回退到内部 HTTP 服务
        const tempDir = path.join(env.DATA_DIR, 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        const name = filename || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
        const filePath = path.join(tempDir, name);
        await fs.writeFile(filePath, buffer);

        const baseUrl = env.INTERNAL_WEB_ENDPOINT || 'http://q2tg:8080';
        const url = `${baseUrl}/temp/${name}`;
        logger.debug(`Saved buffer to local temp and returning URL: ${url}`);
        return url;
    }

    async toNapCat(message: UnifiedMessage): Promise<any[]> {
        const segments: any[] = [];

        for (const content of message.content) {
            switch (content.type) {
                case 'text':
                    segments.push({
                        type: 'text',
                        data: { text: content.data.text },
                    });
                    break;

                case 'image':
                    {
                        let file = content.data.url || content.data.file;
                        if (Buffer.isBuffer(file)) {
                            file = await this.saveBufferToTemp(file, 'image', '.jpg');
                        }
                        segments.push({
                            type: 'image',
                            data: {
                                file,
                                sub_type: content.data.isSpoiler ? '7' : '0',
                            },
                        });
                    }
                    break;

                case 'video':
                    {
                        let file = content.data.url || content.data.file;
                        if (Buffer.isBuffer(file)) {
                            file = await this.saveBufferToTemp(file, 'video', '.mp4');
                        }
                        segments.push({
                            type: 'video',
                            data: {
                                file,
                            },
                        });
                    }
                    break;

                case 'audio':
                    {
                        let file = content.data.url || content.data.file;
                        if (Buffer.isBuffer(file)) {
                            file = await this.saveBufferToTemp(file, 'audio', '.ogg');
                        }
                        segments.push({
                            type: 'record',
                            data: {
                                file,
                            },
                        });
                    }
                    break;

                case 'file':
                    {
                        let file = content.data.url || content.data.file;
                        if (Buffer.isBuffer(file)) {
                            file = await this.saveBufferToTemp(file, 'file', '', content.data.filename);
                        }
                        segments.push({
                            type: 'file',
                            data: {
                                file,
                                name: content.data.filename,
                            },
                        });
                    }
                    break;

                case 'at':
                    segments.push({
                        type: 'at',
                        data: { qq: content.data.targetId },
                    });
                    break;

                case 'reply':
                    segments.push({
                        type: 'reply',
                        data: { id: content.data.messageId },
                    });
                    break;

                case 'sticker':
                    segments.push({
                        type: 'image',
                        data: {
                            file: content.data.url || content.data.file,
                        },
                    });
                    break;
            }
        }
        return segments;
    }
}

// 导出单例
export const messageConverter = new MessageConverter();
