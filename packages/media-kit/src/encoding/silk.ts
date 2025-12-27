import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fsP from 'node:fs/promises'
import { promisify } from 'node:util'
import { decode, encode } from 'silk-wasm'
import { file } from '../../../../main/src/shared/utils/temp'

const execFileAsync = promisify(execFile)
async function runFfmpeg(args: string[]) {
  await execFileAsync('ffmpeg', args)
}

function conventPcmToOgg(pcmPath: string, savePath: string): Promise<void> {
  return runFfmpeg([
    '-y',
    '-f',
    's16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-i',
    pcmPath,
    '-c:a',
    'libopus', // 使用 libopus 编码
    '-b:a',
    '24k', // 比特率
    savePath,
  ])
}

export default {
  /**
   * 解码 SILK 为 OGG (Opus)
   */
  async decode(bufSilk: Buffer, outputPath: string): Promise<void> {
    // silk-wasm 解码得到 PCM 数据
    const result = await decode(bufSilk, 24000)
    const bufPcm = Buffer.from(result.data)

    // 写入临时 PCM 文件
    const { path, cleanup } = await file()
    await fsP.writeFile(path, bufPcm)

    // 使用 ffmpeg 将 PCM 转为 OGG
    try {
      await conventPcmToOgg(path, outputPath)
    }
    finally {
      cleanup()
    }
  },

  /**
   * 编码音频文件为 SILK Buffer
   */
  async encode(filePath: string): Promise<Buffer> {
    const { path: pcmPath, cleanup } = await file()

    try {
      // 1. 转为 PCM
      await runFfmpeg([
        '-y',
        '-i',
        filePath,
        '-f',
        's16le',
        '-ar',
        '24000',
        '-ac',
        '1',
        pcmPath,
      ])

      // 2. 读取 PCM
      const pcmBuffer = await fsP.readFile(pcmPath)

      // 3. 编码为 SILK (24000Hz)
      const result = await encode(pcmBuffer, 24000)
      return Buffer.from(result.data)
    }
    finally {
      cleanup()
    }
  },
}
