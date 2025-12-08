import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { fileTypeFromBuffer } from 'file-type';
import type { MediaFeature } from '../../media/MediaFeature';
import type { MessageContent } from '../../../domain/message';
import { getLogger } from '../../../shared/logger';

export type NormalizedFile = {
    fileName: string;
    data: Buffer;
    fileMime?: string;
};

/**
 * File normalization and handling utilities
 * Converts various file sources (Buffer, Stream, URL, path) to normalized format
 */
export class FileNormalizer {
    private readonly logger = getLogger('FileNormalizer');

    constructor(private readonly media?: MediaFeature) { }

    /**
     * Normalize input file from various sources to Buffer with metadata
     */
    async normalizeInputFile(src: any, fallbackName: string): Promise<NormalizedFile | undefined> {
        if (!src) return undefined;

        let data: Buffer | undefined;
        let fileName = path.basename(fallbackName || 'file') || 'file';
        let fileMime: string | undefined;

        if ((src as any).data && (src as any).fileName) {
            fileName = path.basename((src as any).fileName || fileName);
            if (Buffer.isBuffer((src as any).data)) {
                data = (src as any).data;
            } else if ((src as any).data instanceof Readable) {
                data = await this.streamToBuffer((src as any).data as Readable);
            }
        } else if (Buffer.isBuffer(src)) {
            data = src;
        } else if (typeof src === 'string') {
            if (src.startsWith('/')) {
                try {
                    data = await fs.promises.readFile(src);
                    fileName = path.basename(src) || fileName;
                } catch (err) {
                    this.logger.warn(err, `Local media not accessible: ${src}`);
                    return undefined;
                }
            } else if (/^https?:\/\//.test(src) && this.media) {
                try {
                    data = await this.media.downloadMedia(src);
                } catch (err) {
                    this.logger.warn(err, 'Failed to download media from url:');
                    return undefined;
                }
            }
        } else if (src instanceof Readable) {
            data = await this.streamToBuffer(src);
        }

        if (!data) return undefined;

        try {
            const type = await fileTypeFromBuffer(data);
            if (type?.ext) {
                const base = path.parse(fileName).name || 'file';
                fileName = `${base}.${type.ext}`;
            }
            fileMime = type?.mime;
        } catch (err) {
            this.logger.debug(err, 'File type detection failed:');
        }

        return { fileName, data, fileMime };
    }

    /**
     * Handle local files and mtcute Media objects
     * Converts to Buffer if needed
     */
    async handleLocalOrMtcuteMedia(fileSrc: any, defaultExt: string, tgBotDownloader?: (media: any) => Promise<Buffer>) {
        if (typeof fileSrc === 'string' && fileSrc.startsWith('/')) {
            try {
                fileSrc = await fs.promises.readFile(fileSrc);
            } catch (e) {
                this.logger.warn(e, 'Failed to read local image file, keeping as path:');
            }
        }

        if (fileSrc && typeof fileSrc === 'object' && 'type' in fileSrc && !Buffer.isBuffer(fileSrc) && !(fileSrc instanceof Readable)) {
            if (!tgBotDownloader) {
                this.logger.warn('Cannot download mtcute Media object: downloader not provided');
                return undefined;
            }
            try {
                this.logger.debug(`Detected mtcute Media object (type=${fileSrc.type}), downloading...`);
                const buffer = await tgBotDownloader(fileSrc);
                if (buffer && buffer.length > 0) {
                    fileSrc = buffer as Buffer;
                    this.logger.debug(`Downloaded media buffer size: ${buffer.length}`);
                } else {
                    this.logger.warn('Downloaded buffer is empty');
                    fileSrc = undefined;
                }
            } catch (e) {
                this.logger.warn(e, 'Failed to download mtcute Media object:');
                fileSrc = undefined;
            }
        }

        if (fileSrc instanceof Readable) {
            fileSrc = { fileName: `media.${defaultExt}`, data: fileSrc };
        } else if (Buffer.isBuffer(fileSrc)) {
            let ext = defaultExt;
            if (defaultExt === 'jpg') {
                const type = await fileTypeFromBuffer(fileSrc);
                ext = type?.ext || 'jpg';
                this.logger.debug(`Detected image type: ${ext}, mime: ${type?.mime}`);
            }
            fileSrc = { fileName: `media.${ext}`, data: fileSrc };
        }

        return fileSrc;
    }

    /**
     * Resolve media input from MessageContent using MediaFeature
     */
    async resolveMediaInput(content: MessageContent, tgBotDownloader?: (media: any) => Promise<Buffer>): Promise<any> {
        if (!this.media) return (content as any).data?.file || (content as any).data?.url;

        let fileSrc: any;

        if (content.type === 'image') {
            fileSrc = await this.media.processImage(content as any);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'jpg', tgBotDownloader);
        } else if (content.type === 'video') {
            fileSrc = await this.media.processVideo(content as any);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'mp4', tgBotDownloader);
        } else if (content.type === 'audio') {
            fileSrc = await this.media.processAudio(content as any);
            fileSrc = await this.handleLocalOrMtcuteMedia(fileSrc, 'amr', tgBotDownloader);
        } else if (content.type === 'file') {
            const file = content as any;
            if (file.data.file) {
                fileSrc = file.data.file;
            } else if (file.data.url) {
                fileSrc = await this.media.downloadMedia(file.data.url);
            }
            if (fileSrc instanceof Readable) {
                fileSrc = { fileName: file.data.filename || 'file', data: fileSrc };
            }
        } else {
            fileSrc = (content as any).data?.file || (content as any).data?.url;
        }

        return fileSrc;
    }

    /**
     * Check if media is GIF format
     */
    isGifMedia(file: NormalizedFile): boolean {
        return file.fileMime === 'image/gif' || file.fileName.toLowerCase().endsWith('.gif');
    }

    /**
     * Convert stream to buffer
     */
    async streamToBuffer(stream: Readable): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }
}
