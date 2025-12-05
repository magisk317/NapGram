import type { UnifiedMessage, MessageContent } from '../types';
import { getLogger } from '../../../shared/utils/logger';
import type { Receive } from 'node-napcat-ts';
import env from '../../models/env';
import fs from 'fs/promises';
import path from 'path';
import fsSync from 'fs';
import { Message } from '@mtcute/core';

import { NapCatConverter, TelegramConverter, UnifiedConverter } from '../converters';

const logger = getLogger('MessageConverter');

/**
 * 增强的消息转换器
 * Phase 2: 完整支持所有消息类型
 */
export class MessageConverter {
    private napCatConverter = new NapCatConverter();
    private telegramConverter = new TelegramConverter();
    private unifiedConverter = new UnifiedConverter();

    /**
     * 从 NapCat 消息转换为统一格式
     */
    fromNapCat(napCatMsg: any): UnifiedMessage {
        return this.napCatConverter.fromNapCat(napCatMsg);
    }

    /**
     * 统一格式转换为 NapCat 格式
     */


    /**
     * 从 Telegram 消息转换为统一格式
     */
    /**
     * 从 Telegram 消息转换为统一格式
     */
    fromTelegram(tgMsg: Message): UnifiedMessage {
        return this.telegramConverter.fromTelegram(tgMsg);
    }

    /**
     * 统一格式转换为 Telegram 格式
     */
    /**
     * 统一格式转换为 Telegram 格式
     */
    toTelegram(msg: UnifiedMessage): any {
        return this.unifiedConverter.toTelegram(msg);
    }

    // ============ NapCat 转换辅助方法 ============

    async toNapCat(message: UnifiedMessage): Promise<any[]> {
        return this.unifiedConverter.toNapCat(message);
    }
}

// 导出单例
export const messageConverter = new MessageConverter();
