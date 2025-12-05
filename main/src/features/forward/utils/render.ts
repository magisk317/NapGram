import type { MessageContent } from '../../../domain/message';

export function renderContent(content: MessageContent): string {
    switch (content.type) {
        case 'text':
            // NapCat sometimes encodes newlines as literal "\n"
            return (content.data.text || '').replace(/\\n/g, '\n');
        case 'image':
            return '[图片]';
        case 'video':
            return '[视频]';
        case 'audio':
            return '[语音]';
        case 'file':
            return `[文件:${content.data.filename || '文件'}]`;
        case 'at':
            return `@${content.data.userName || content.data.userId}`;
        case 'face':
            return content.data.text || '[表情]';
        case 'reply':
            return `(回复 ${content.data.messageId}${content.data.text ? ':' + content.data.text : ''})`;
        case 'forward':
            return `[转发消息x${content.data.messages?.length ?? 0}]`;
        case 'location':
            return `[位置:${content.data.title ?? ''} ${content.data.latitude},${content.data.longitude}]`;
        default:
            return `[${content.type}]`;
    }
}
