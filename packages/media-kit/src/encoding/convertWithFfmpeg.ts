import { execFile } from 'node:child_process'
import fsP from 'node:fs/promises'
import { promisify } from 'node:util'
import { getLogger } from '../../../../main/src/shared/logger'

const logger = getLogger('convertWithFfmpeg')
const execFileAsync = promisify(execFile)

export default async function (sourcePath: string, targetPath: string, format: string, srcFormat?: string) {
  try {
    const args: string[] = ['-y']
    if (srcFormat) {
      args.push('-c:v', srcFormat)
    }
    args.push('-i', sourcePath)
    if (format === 'gif') {
      args.push('-filter_complex', '[0:v] palettegen=reserve_transparent=on [p]; [0:v][p] paletteuse=dither=floyd_steinberg')
    }
    if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9')
    }
    args.push('-f', format, targetPath)

    logger.debug(`正在启动 ffmpeg: ffmpeg ${args.join(' ')}`)
    await execFileAsync('ffmpeg', args)
  }
  catch (e) {
    logger.error(e, 'ffmpeg 转换失败')
    try {
      const stats = await fsP.stat(targetPath)
      logger.debug(`转换结果文件大小: ${stats.size}`)
      if (!stats.size) {
        logger.error(new Error('转换结果文件为空'), `转换结果文件为空: ${targetPath}`)
        await fsP.rm(targetPath)
      }
    }
    catch (cleanupError) {
      logger.warn(cleanupError, `无法清理转换结果文件: ${targetPath}`)
    }
    throw e
  }
}
