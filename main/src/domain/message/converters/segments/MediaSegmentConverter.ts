import type { MessageContent } from '../../types';
import { getLogger } from '../../../../shared/logger';

const logger = getLogger('MediaSegmentConverter');

/**
 * 媒体类型消息段转换器（图片、视频、音频）
 */
export class MediaSegmentConverter {
    convertImage(data: any): MessageContent {
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

    convertVideo(data: any, rawMessage?: string): MessageContent {
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

    convertAudio(data: any): MessageContent {
        return {
            type: 'audio',
            data: {
                url: data.url || data.file,
                file: data.file,
            },
        };
    }

    convertFlash(data: any): MessageContent {
        return {
            type: 'image',
            data: {
                url: data.url || data.file,
                file: data.file,
                isSpoiler: true,
            },
        };
    }

    convertFile(data: any): MessageContent {
        return {
            type: 'file',
            data: {
                url: data.url,
                filename: data.file || data.name,
                size: data.file_size ? Number(data.file_size) : undefined,
            },
        };
    }

    convertSticker(data: any): MessageContent {
        return {
            type: 'sticker',
            data: {
                url: data.url,
                isAnimated: true,
            },
        };
    }
}
