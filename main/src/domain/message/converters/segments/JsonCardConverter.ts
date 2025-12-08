import type { MessageContent } from '../../types';
import { getLogger } from '../../../../shared/logger';

const logger = getLogger('JsonCardConverter');

/**
 * JSON卡片消息转换器
 */
export class JsonCardConverter {
    convertJsonCard(data: any): MessageContent[] | null {
        const parsed = this.parseJsonData(data?.data);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const locationMeta =
            parsed.meta?.['Location.Search'] ||
            parsed.meta?.Location?.Search ||
            parsed.meta?.location?.search ||
            parsed.meta?.location;

        const miniapp = parsed.meta?.miniapp || parsed.meta?.mini_app;
        const detail =
            parsed.meta?.detail_1 ||
            parsed.meta?.news ||
            parsed.meta?.detail ||
            parsed.meta?.card ||
            parsed.meta?.music ||
            parsed.meta?.video ||
            parsed.meta?.image;

        const prompt = (parsed.prompt || '').trim();
        const appName = (miniapp?.title || detail?.title || parsed.app || '').trim();
        const source = (miniapp?.source || detail?.source || '').trim();
        const desc = (detail?.desc || prompt || '').trim();
        const url = this.normalizeUrl(
            miniapp?.jumpUrl ||
            miniapp?.pcJumpUrl ||
            detail?.qqdocurl ||
            detail?.jumpUrl ||
            detail?.url
        );
        const preview = this.normalizeUrl(
            miniapp?.preview ||
            miniapp?.sourcelogo ||
            detail?.preview ||
            detail?.image ||
            detail?.picurl ||
            detail?.icon
        );

        const lines: string[] = [];
        lines.push(appName ? `[QQ小程序] ${appName}` : '[QQ小程序]');
        if (source) {
            lines.push(`来源：${source}`);
        }
        if (desc) {
            lines.push(desc);
        }
        if (url) {
            lines.push(url);
        }

        const text = lines.filter(Boolean).join('\n').trim();
        if (!text) {
            return null;
        }

        const contents: MessageContent[] = [];

        // 如果是位置卡片，优先输出 location 类型
        if (locationMeta) {
            const lat = Number(locationMeta.lat ?? locationMeta.latitude);
            const lng = Number(locationMeta.lng ?? locationMeta.longitude ?? locationMeta.lon);
            const name = (locationMeta.name || locationMeta.title || appName || '').trim();
            const address = (locationMeta.address || desc || '').trim();
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                contents.push({
                    type: 'location',
                    data: {
                        latitude: lat,
                        longitude: lng,
                        title: name || undefined,
                        address: address || undefined,
                    },
                });
            }
        }

        // 对于位置卡片，避免重复输出小程序占位文本
        if (!locationMeta) {
            contents.push({
                type: 'text',
                data: { text: this.truncateText(text) },
            });
        }

        if (preview) {
            contents.push({
                type: 'image',
                data: {
                    url: preview,
                },
            });
        }

        return contents;
    }

    private parseJsonData(data: any): any | null {
        if (!data) return null;
        if (typeof data === 'object') return data;
        if (typeof data !== 'string') return null;

        try {
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Failed to parse NapCat json segment', error);
            return null;
        }
    }

    private normalizeUrl(url?: string): string | undefined {
        if (!url || typeof url !== 'string') return undefined;
        let normalized = url.trim();
        if (!normalized) return undefined;

        if (normalized.startsWith('//')) {
            normalized = `https:${normalized}`;
        } else if (!/^https?:\/\//.test(normalized)) {
            if (normalized.startsWith('m.q.qq.com') || normalized.startsWith('qq.ugcimg.cn') || normalized.startsWith('b23.tv')) {
                normalized = `https://${normalized}`;
            } else {
                return undefined;
            }
        }

        return normalized;
    }

    private truncateText(text: string, maxLength = 500): string {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 3)}...`;
    }
}
