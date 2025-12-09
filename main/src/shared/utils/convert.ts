import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { file as createTempFile } from './temp';
import fsP from 'fs/promises';
import convertWithFfmpeg from './encoding/convertWithFfmpeg';
import tgsToGif from './encoding/tgsToGif';
import { getLogger } from '../logger';
import env from '../../domain/models/env';
import { fileTypeFromBuffer } from 'file-type';

const CACHE_PATH = env.CACHE_DIR;
fs.mkdirSync(CACHE_PATH, { recursive: true });

// 首先查找缓存，要是缓存中没有的话执行第二个参数的方法转换到缓存的文件
const cachedConvert = async (key: string, convert: (outputPath: string) => Promise<any>) => {
  const convertedPath = path.join(CACHE_PATH, key);
  if (!fs.existsSync(convertedPath)) {
    await convert(convertedPath);
  }
  return convertedPath;
};

const convert = {
  cached: cachedConvert,
  cachedBuffer: (key: string, buf: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key, async (convertedPath) => {
      await fsP.writeFile(convertedPath, await buf());
    }),
  // webp2png，这里 webpData 是方法因为不需要的话就不获取了
  png: (key: string, webpData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.png', async (convertedPath) => {
      await sharp(await webpData()).png().toFile(convertedPath);
    }),
  video2gif: (key: string, webmData: () => Promise<Buffer | Uint8Array | string>, webm = false) =>
    cachedConvert(key + '.gif', async (convertedPath) => {
      const temp = await createTempFile();
      await fsP.writeFile(temp.path, await webmData());
      await convertWithFfmpeg(temp.path, convertedPath, 'gif', webm ? 'libvpx-vp9' : undefined);
      await temp.cleanup();
    }),
  tgs2gif: (key: string, tgsData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.gif', async (convertedPath) => {
      const logger = getLogger('TGSConverter');
      const src = await tgsData();

      logger.debug(`[tgs2gif] Start conversion for key: ${key}, dest: ${convertedPath}`);
      logger.debug(`[tgs2gif] src type: ${typeof src}, isBuffer: ${Buffer.isBuffer(src)}`);

      if (Buffer.isBuffer(src)) {
        logger.debug(`[tgs2gif] Processing buffer, size: ${src.length}`);
        const tempDir = path.join(env.DATA_DIR, 'temp');
        await fsP.mkdir(tempDir, { recursive: true });

        const tempTgsPath = path.join(tempDir, `sticker-${Date.now()}-${Math.random().toString(16).slice(2)}.tgs`);

        try {
          logger.debug(`[tgs2gif] Writing TGS buffer to: ${tempTgsPath}`);
          await fsP.writeFile(tempTgsPath, src);
          logger.info(`[tgs2gif] TGS file written successfully, calling tgsToGif...`);

          await tgsToGif(tempTgsPath, convertedPath);
          logger.info(`[tgs2gif] tgsToGif completed, checking output...`);

          // Verify output file exists
          try {
            const stats = await fsP.stat(convertedPath);
            logger.info(`[tgs2gif] GIF created successfully, size: ${stats.size}`);
          } catch (statErr) {
            logger.error(`[tgs2gif] Output GIF file not found: ${convertedPath}`);
            throw new Error('TGS to GIF conversion produced no output file');
          }

          // Cleanup temp files
          try {
            await fsP.unlink(tempTgsPath);
            logger.debug(`[tgs2gif] Cleaned up temp TGS file: ${tempTgsPath}`);
          } catch (cleanupErr) {
            logger.warn(cleanupErr, '[tgs2gif] Failed to cleanup temp TGS file');
          }
        } catch (e) {
          logger.error(e, `[tgs2gif] Conversion failed for key: ${key}`);
          logger.error(`[tgs2gif] Error details: ${e instanceof Error ? e.stack : String(e)}`);
          throw e;
        }
      } else if (typeof src === 'string' && /\.tgs$/i.test(src)) {
        logger.debug(`[tgs2gif] Processing TGS file path: ${src}`);
        try {
          await tgsToGif(src, convertedPath);
          logger.info(`[tgs2gif] Direct file conversion completed for key: ${key}`);
        } catch (e) {
          logger.error(e, `[tgs2gif] Direct file conversion failed for key: ${key}`);
          throw e;
        }
      } else {
        const errMsg = `Unsupported sticker source type for key ${key}: ${typeof src}`;
        logger.error(`[tgs2gif] ${errMsg}`);
        throw new Error(errMsg);
      }
    }),
  webp: (key: string, imageData: () => Promise<Buffer | Uint8Array | string>) =>
    cachedConvert(key + '.webp', async (convertedPath) => {
      await sharp(await imageData()).webp().toFile(convertedPath);
    }),
  webm: (key: string, filePath: string) =>
    cachedConvert(key + '.webm', async (convertedPath) => {
      await convertWithFfmpeg(filePath, convertedPath, 'webm');
    }),
  webpOrWebm: async (key: string, imageData: () => Promise<Buffer | Uint8Array>) => {
    const filePath = await convert.cachedBuffer(key, imageData);
    const fileType = await fileTypeFromBuffer(await fsP.readFile(filePath));
    if (fileType && fileType.mime === 'image/gif') {
      return await convert.webm(key, filePath);
    }
    else {
      return await convert.webp(key, async () => filePath);
    }
  },
  customEmoji: async (key: string, imageData: () => Promise<Buffer | Uint8Array | string>, useSmallSize: boolean) => {
    if (useSmallSize) {
      const pathPng = path.join(CACHE_PATH, key + '@50.png');
      const pathGif = path.join(CACHE_PATH, key + '@50.gif');
      if (fs.existsSync(pathPng)) return pathPng;
      if (fs.existsSync(pathGif)) return pathGif;
    }
    else {
      const pathPng = path.join(CACHE_PATH, key + '.png');
      const pathGif = path.join(CACHE_PATH, key + '.gif');
      if (fs.existsSync(pathPng)) return pathPng;
      if (fs.existsSync(pathGif)) return pathGif;
    }
    // file not found
    const data = await imageData() as Buffer;
    const fileType = (await fileTypeFromBuffer(data))?.mime || 'image/';
    let pathPngOrig: string, pathGifOrig: string;
    if (fileType.startsWith('image/')) {
      pathPngOrig = await convert.png(key, () => Promise.resolve(data));
    }
    else {
      pathGifOrig = await convert.tgs2gif(key, () => Promise.resolve(data));
    }
    if (!useSmallSize) return pathPngOrig || pathGifOrig;
    if (pathPngOrig) {
      return await cachedConvert(key + '@50.png', async (convertedPath) => {
        await sharp(pathPngOrig).resize(50).toFile(convertedPath);
      });
    }
    else {
      return await cachedConvert(key + '@50.gif', async (convertedPath) => {
        await sharp(pathGifOrig).resize(50).toFile(convertedPath);
      });
    }
  },
};

export default convert;
