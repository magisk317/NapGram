import { file } from 'tmp-promise';
import silk from 'silk-sdk';
import fsP from 'fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const runFfmpeg = async (args: string[]) => {
  await execFileAsync('ffmpeg', args);
};

const conventPcmToOgg = (pcmPath: string, savePath: string): Promise<void> => {
  return runFfmpeg([
    '-y',
    '-f', 's16le',
    '-ar', '24000',
    '-ac', '1',
    '-i', pcmPath,
    '-c:a', 'libopus', // 使用 libopus 编码
    '-b:a', '24k',     // 比特率
    savePath,
  ]);
};

export default {
  /**
   * 解码 SILK 为 OGG (Opus)
   */
  async decode(bufSilk: Buffer, outputPath: string): Promise<void> {
    // silk-sdk 解码得到 PCM 数据
    const bufPcm = silk.decode(bufSilk);

    // 写入临时 PCM 文件
    const { path, cleanup } = await file();
    await fsP.writeFile(path, bufPcm);

    // 使用 ffmpeg 将 PCM 转为 OGG
    try {
      await conventPcmToOgg(path, outputPath);
    } finally {
      cleanup();
    }
  },

  /**
   * 编码音频文件为 SILK Buffer
   */
  async encode(filePath: string): Promise<Buffer> {
    const { path: pcmPath, cleanup } = await file();

    try {
      // 1. 转为 PCM
      await runFfmpeg([
        '-y',
        '-i', filePath,
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        pcmPath
      ]);

      // 2. 读取 PCM
      const pcmBuffer = await fsP.readFile(pcmPath);

      // 3. 编码为 SILK (24000Hz)
      return silk.encode(pcmBuffer, 24000);
    } finally {
      cleanup();
    }
  }
};
