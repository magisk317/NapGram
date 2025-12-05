import { BaseConverter } from './BaseConverter';
import type { UnifiedMessage, MessageContent } from '../types';

export class NapCatConverter extends BaseConverter {
    /**
     * 从 NapCat 消息转换为统一格式
     */
    fromNapCat(napCatMsg: any): UnifiedMessage {
        this.logger.info(`Converting from NapCat: ${napCatMsg.message_id}`);
        this.logger.debug(`Converting NapCat message segments:\n${JSON.stringify(napCatMsg.message, null, 2)}`);

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

    private convertNapCatSegment(segment: any, rawMsg?: any): MessageContent | null {
        this.logger.debug(`Converting segment:\n${JSON.stringify(segment, null, 2)}`);
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
                this.logger.warn({ type }, 'Unknown NapCat segment type:');
                return null;
        }
    }
}
