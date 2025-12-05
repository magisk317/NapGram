import { getLogger } from '../logger';
import fsP from 'fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const logger = getLogger('convertWithFfmpeg');
const execFileAsync = promisify(execFile);

export default function (sourcePath: string, targetPath: string, format: string, srcFormat?: string) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const args: string[] = ['-y'];
      if (srcFormat) {
        args.push('-c:v', srcFormat);
      }
      args.push('-i', sourcePath);
      if (format === 'gif') {
        args.push('-filter_complex', '[0:v] palettegen=reserve_transparent=on [p]; [0:v][p] paletteuse=dither=floyd_steinberg');
      }
      if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9');
      }
      args.push('-f', format, targetPath);

      logger.debug('正在启动 ffmpeg: ffmpeg ' + args.join(' '));
      await execFileAsync('ffmpeg', args);
      resolve();
    }
    catch (e) {
      logger.error(e, 'ffmpeg 转换失败');
      reject(e);
      const stats = await fsP.stat(targetPath);
      logger.debug('转换结果文件大小: ' + stats.size);
      if (!stats.size) {
        logger.error(new Error('转换结果文件为空'), '转换结果文件为空: ' + targetPath);
        await fsP.rm(targetPath);
      }
    }
  });
}
