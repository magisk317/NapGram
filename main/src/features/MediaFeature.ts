import { getLogger } from '../shared/logger';
import type { IQQClient } from '../infrastructure/clients/qq';
import type { UnifiedMessage, ImageContent, VideoContent, AudioContent } from '../domain/message';
import type Telegram from '../infrastructure/clients/telegram/client';
import type Instance from '../domain/models/Instance';

import { createReadStream } from 'fs';
import { file as createTempFile } from '../shared/utils/temp';
import fsP from 'fs/promises';

const logger = getLogger('MediaFeature');

/**
 * 媒体处理功能
 * Phase 3: 处理图片、视频、音频等媒体文件
 */
export class MediaFeature {
    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
    ) {
        logger.info('MediaFeature initialized');
    }

    /**
     * 下载媒体文件
     */
    async downloadMedia(url: string): Promise<Buffer> {
        try {
            logger.debug(`Downloading media from: ${url}`);

            // Handle local file paths
            if (url.startsWith('/')) {
                try {
                    const stat = await fsP.stat(url);
                    if (stat.size === 0 && url.endsWith('.amr')) {
                        const wavPath = `${url}.wav`;
                        try {
                            const wavStat = await fsP.stat(wavPath);
                            if (wavStat.size > 0) {
                                return await fsP.readFile(wavPath);
                            }
                        } catch {
                            // ignore
                        }
                    }
                    return await fsP.readFile(url);
                } catch (error) {
                    logger.warn(`Local file not accessible: ${url}`, error);
                    // Fallback to fetch if it's somehow a URL starting with / (unlikely but safe)
                    // Actually, if it starts with /, fetch will fail. So just throw.
                    throw error;
                }
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            try {
                const response = await fetch(url, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            logger.error('Failed to download media:', error);
            throw error;
        }
    }

    /**
     * 处理图片
     */
    async processImage(content: ImageContent): Promise<Buffer | string> {
        // 优先使用可访问的 file 字段
        if (content.data.file) {
            if (Buffer.isBuffer(content.data.file)) return content.data.file;
            if (typeof content.data.file === 'string') {
                if (/^https?:\/\//.test(content.data.file)) {
                    return this.downloadMedia(content.data.file);
                }
                // 本地路径，尝试读取；失败则尝试 url 兜底
                if (content.data.file.startsWith('/')) {
                    try {
                        await fsP.access(content.data.file);
                        return content.data.file;
                    } catch {
                        // ignore, fallback below
                    }
                }
            }
        }
        if (content.data.url) {
            return this.downloadMedia(content.data.url);
        }
        throw new Error('No image source available');
    }

    /**
     * 处理视频
     */
    async processVideo(content: VideoContent): Promise<Buffer | string> {
        if (content.data.file) {
            if (Buffer.isBuffer(content.data.file)) return content.data.file;
            if (typeof content.data.file === 'string') {
                if (/^https?:\/\//.test(content.data.file)) {
                    return this.downloadMedia(content.data.file);
                }
                if (content.data.file.startsWith('/')) {
                    try {
                        await fsP.access(content.data.file);
                        return content.data.file;
                    } catch {
                        // fallback to url below
                    }
                }
            }
        }
        if (content.data.url) {
            return this.downloadMedia(content.data.url);
        }
        throw new Error('No video source available');
    }

    /**
     * 处理音频
     */
    async processAudio(content: AudioContent): Promise<Buffer | string> {
        if (content.data.file) {
            if (Buffer.isBuffer(content.data.file)) return content.data.file;
            if (typeof content.data.file === 'string') {
                // NapCat 录音会生成 .amr 和 .amr.wav，优先使用可读的 wav
                if (content.data.file.endsWith('.amr')) {
                    const wavPath = `${content.data.file}.wav`;
                    try {
                        await fsP.access(wavPath);
                        return wavPath;
                    } catch {
                        // ignore and continue
                    }
                }
                if (/^https?:\/\//.test(content.data.file)) {
                    return this.downloadMedia(content.data.file);
                }
                if (content.data.file.startsWith('/')) {
                    try {
                        await fsP.access(content.data.file);
                        return content.data.file;
                    } catch {
                        // fallback to url below
                    }
                }
            }
        }
        if (content.data.url) {
            return this.downloadMedia(content.data.url);
        }
        throw new Error('No audio source available');
    }

    /**
     * 创建临时文件
     */
    async createTempFileFromBuffer(buffer: Buffer, extension: string = '.tmp') {
        const tempFile = await createTempFile({ postfix: extension });
        await fsP.writeFile(tempFile.path, buffer);
        return tempFile;
    }

    /**
     * 获取媒体文件大小
     */
    getMediaSize(buffer: Buffer): number {
        return buffer.length;
    }

    /**
     * 检查媒体大小是否超限
     */
    isMediaTooLarge(buffer: Buffer, maxSize: number = 20 * 1024 * 1024): boolean {
        return buffer.length > maxSize;
    }

    /**
     * 压缩图片（如果需要）
     */
    async compressImage(buffer: Buffer, maxSize: number = 5 * 1024 * 1024): Promise<Buffer> {
        try {
            // 如果文件已经小于限制，直接返回
            if (buffer.length <= maxSize) {
                return buffer;
            }

            logger.info(`Compressing image: ${buffer.length} bytes > ${maxSize} bytes`);

            // 动态导入 sharp（避免在没有使用时加载）
            const sharp = (await import('sharp')).default;

            // 获取图片元信息
            const metadata = await sharp(buffer).metadata();
            const format = metadata.format as 'jpeg' | 'png' | 'webp' | 'gif' | undefined;

            if (!format || !['jpeg', 'png', 'webp', 'gif'].includes(format)) {
                logger.warn(`Unsupported image format for compression: ${format}`);
                return buffer;
            }

            // 计算压缩目标
            // 策略：从 80% 质量开始，如果还是太大，尝试降低质量或缩小尺寸
            let quality = 80;
            let compressed = buffer;

            // 第一次尝试：压缩质量
            while (quality >= 50) {
                let sharpInstance = sharp(buffer);

                if (format === 'jpeg') {
                    compressed = await sharpInstance.jpeg({ quality }).toBuffer();
                } else if (format === 'png') {
                    compressed = await sharpInstance.png({ quality, compressionLevel: 9 }).toBuffer();
                } else if (format === 'webp') {
                    compressed = await sharpInstance.webp({ quality }).toBuffer();
                } else {
                    // GIF 转换为 WebP
                    compressed = await sharpInstance.webp({ quality }).toBuffer();
                }

                if (compressed.length <= maxSize) {
                    logger.info(`Compressed with quality ${quality}: ${buffer.length} -> ${compressed.length} bytes`);
                    return compressed;
                }

                quality -= 10;
            }

            // 第二次尝试：缩小尺寸
            if (metadata.width && metadata.height) {
                const scaleFactor = Math.sqrt(maxSize / compressed.length);
                const newWidth = Math.floor(metadata.width * scaleFactor);
                const newHeight = Math.floor(metadata.height * scaleFactor);

                logger.info(`Resizing image from ${metadata.width}x${metadata.height} to ${newWidth}x${newHeight}`);

                let sharpInstance = sharp(buffer).resize(newWidth, newHeight, {
                    fit: 'inside',
                    withoutEnlargement: true,
                });

                if (format === 'jpeg') {
                    compressed = await sharpInstance.jpeg({ quality: 70 }).toBuffer();
                } else {
                    compressed = await sharpInstance.webp({ quality: 70 }).toBuffer();
                }

                logger.info(`Final compressed size: ${compressed.length} bytes`);
            }

            return compressed;

        } catch (error) {
            logger.error('Image compression failed:', error);
            // 压缩失败时返回原图
            return buffer;
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        logger.info('MediaFeature destroyed');
    }
}
