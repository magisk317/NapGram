import { file } from '../utils/temp';
import silk from 'silk-sdk';
import fsP from 'fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const runFfmpeg = async (args: string[]) => {
  await execFileAsync('ffmpeg', args);
};

const conventOggToPcm = (oggPath: string, tmpFilePath: string): Promise<void> => {
  return runFfmpeg([
    '-y',
    '-i', oggPath,
    '-f', 's16le',
    '-ar', '24000',
    '-ac', '1',
    '-acodec', 'pcm_s16le',
    tmpFilePath,
  ]);
};

const conventOggToPcm16000 = (oggPath: string, tmpFilePath: string): Promise<void> => {
  return runFfmpeg([
    '-y',
    '-i', oggPath,
    '-f', 's16le',
    '-ar', '16000',
    '-ac', '1',
    '-acodec', 'pcm_s16le',
    tmpFilePath,
  ]);
};

const conventPcmToOgg = (pcmPath: string, savePath: string): Promise<void> => {
  return runFfmpeg([
    '-y',
    '-f', 's16le',
    '-ar', '24000',
    '-ac', '1',
    '-i', pcmPath,
    '-f', 'ogg',
    savePath,
  ]);
};

export default {
  async encode(oggPath: string): Promise<Buffer> {
    const { path, cleanup } = await file();
    await conventOggToPcm(oggPath, path);
    const bufSilk = silk.encode(path, {
      tencent: true,
    });
    await cleanup();
    return bufSilk;
  },

  async decode(bufSilk: Buffer, outputPath: string): Promise<void> {
    const bufPcm = silk.decode(bufSilk);
    const { path, cleanup } = await file();
    await fsP.writeFile(path, bufPcm);
    await conventPcmToOgg(path, outputPath);
    cleanup();
  },

  conventOggToPcm16000: (oggPath: string, tmpFilePath: string): Promise<void> => {
    return conventOggToPcm16000(oggPath, tmpFilePath);
  },
};
