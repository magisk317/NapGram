import type { AudioContent, ImageContent, VideoContent } from '../domain/message'
import type Instance from '../domain/models/Instance'
import type { IQQClient } from '../infrastructure/clients/qq'
import type Telegram from '../infrastructure/clients/telegram/client'

import { Buffer } from 'node:buffer'
import fsP from 'node:fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import { Jimp } from 'jimp'
import { getLogger } from '../shared/logger'
import { file as createTempFile } from '../shared/utils/temp'

const logger = getLogger('MediaFeature')

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
    logger.info('MediaFeature ✓ 初始化完成')
  }

  /**
   * 下载媒体文件
   */
  async downloadMedia(url: string): Promise<Buffer> {
    try {
      logger.debug(`Downloading media from: ${url}`)

      // Handle local file paths
      if (url.startsWith('/')) {
        try {
          const stat = await fsP.stat(url)
          if (stat.size === 0 && url.endsWith('.amr')) {
            const wavPath = `${url}.wav`
            try {
              const wavStat = await fsP.stat(wavPath)
              if (wavStat.size > 0) {
                return await fsP.readFile(wavPath)
              }
            }
            catch {
              // ignore
            }
          }
          return await fsP.readFile(url)
        }
        catch (error) {
          logger.warn(`Local file not accessible: ${url}`, error)
          // Fallback to fetch if it's somehow a URL starting with / (unlikely but safe)
          // Actually, if it starts with /, fetch will fail. So just throw.
          throw error
        }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const response = await fetch(url, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Download failed: ${response.status} ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        return Buffer.from(arrayBuffer)
      }
      finally {
        clearTimeout(timeoutId)
      }
    }
    catch (error) {
      logger.error('Failed to download media:', error)
      throw error
    }
  }

  /**
   * 通过 NapCat file_id 获取文件（兜底：naplink get_file / download_file）
   */
  async fetchFileById(fileId: string): Promise<{ buffer?: Buffer, url?: string, path?: string }> {
    const normalizedId = fileId.replace(/^\//, '')
    const qq: any = this.qqClient as any
    try {
      let res: any = null
      if (typeof qq.getFile === 'function') {
        res = await qq.getFile(normalizedId)
      }
      else if (typeof qq.callApi === 'function') {
        res = await qq.callApi('get_file', { file: normalizedId }).catch(() => null)
      }

      if (res) {
        const fileUrl = res.url || res.file
        if (fileUrl) {
          // http 直链：优先直接下载；失败再尝试 download_file（要求传入 url，而不是 file_id）
          if (/^https?:\/\//.test(fileUrl)) {
            try {
              return { buffer: await this.downloadMedia(fileUrl), url: fileUrl }
            }
            catch (error) {
              const downloaded
                = typeof qq.downloadFile === 'function'
                  ? await qq.downloadFile(fileUrl, 3).catch(() => null)
                  : typeof qq.callApi === 'function'
                    ? await qq.callApi('download_file', { url: fileUrl, thread_count: 3 }).catch(() => null)
                    : null
              const local = downloaded?.file || downloaded?.path
              if (local && typeof local === 'string') {
                try {
                  return { buffer: await fsP.readFile(local), path: local }
                }
                catch {
                  // ignore
                }
              }
              throw error
            }
          }

          // 本地路径
          if (typeof fileUrl === 'string' && fileUrl.startsWith('/')) {
            try {
              return { buffer: await fsP.readFile(fileUrl), path: fileUrl }
            }
            catch {
              // fallthrough
            }
          }
        }

        if (res.data && Buffer.isBuffer(res.data)) {
          return { buffer: res.data }
        }
      }

      // 最后兜底：NapCat 流式下载（不依赖外部 URL 可达）
      if (typeof qq.downloadFileStreamToFile === 'function') {
        const streamed = await qq
          .downloadFileStreamToFile(normalizedId, { chunkSize: 64 * 1024 })
          .catch(() => null)
        const local = streamed?.path
        if (local && typeof local === 'string') {
          try {
            return { buffer: await fsP.readFile(local), path: local }
          }
          catch {
            // ignore
          }
        }
      }
    }
    catch (err) {
      logger.warn(err, `Failed to fetch file by id=${fileId}`)
    }
    return {}
  }

  /**
   * 处理图片
   */
  async processImage(content: ImageContent): Promise<Buffer | string> {
    // 优先使用可访问的 file 字段
    if (content.data.file) {
      if (Buffer.isBuffer(content.data.file))
        return content.data.file
      if (typeof content.data.file === 'string') {
        if (/^https?:\/\//.test(content.data.file)) {
          return this.downloadMedia(content.data.file)
        }
        // 本地路径，尝试读取；失败则尝试 url 兜底
        if (content.data.file.startsWith('/')) {
          try {
            await fsP.access(content.data.file)
            return content.data.file
          }
          catch {
            // ignore, fallback below
          }
        }
      }
    }
    if (content.data.url) {
      return this.downloadMedia(content.data.url)
    }
    throw new Error('No image source available')
  }

  /**
   * 处理视频
   */
  async processVideo(content: VideoContent): Promise<Buffer | string> {
    if (content.data.file) {
      if (Buffer.isBuffer(content.data.file))
        return content.data.file
      if (typeof content.data.file === 'string') {
        if (/^https?:\/\//.test(content.data.file)) {
          return this.downloadMedia(content.data.file)
        }
        if (content.data.file.startsWith('/')) {
          try {
            await fsP.access(content.data.file)
            return content.data.file
          }
          catch {
            // fallback to url below
          }
        }
      }
    }
    if (content.data.url) {
      return this.downloadMedia(content.data.url)
    }
    throw new Error('No video source available')
  }

  /**
   * 处理音频
   */
  async processAudio(content: AudioContent): Promise<Buffer | string> {
    if (content.data.file) {
      if (Buffer.isBuffer(content.data.file))
        return content.data.file
      if (typeof content.data.file === 'string') {
        // NapCat 录音会生成 .amr 和 .amr.wav，优先使用可读的 wav
        if (content.data.file.endsWith('.amr')) {
          const wavPath = `${content.data.file}.wav`
          try {
            await fsP.access(wavPath)
            return wavPath
          }
          catch {
            // ignore and continue
          }
        }
        if (/^https?:\/\//.test(content.data.file)) {
          return this.downloadMedia(content.data.file)
        }
        if (content.data.file.startsWith('/')) {
          try {
            await fsP.access(content.data.file)
            return content.data.file
          }
          catch {
            // fallback to url below
          }
        }
      }
    }
    if (content.data.url) {
      return this.downloadMedia(content.data.url)
    }
    throw new Error('No audio source available')
  }

  /**
   * 创建临时文件
   */
  async createTempFileFromBuffer(buffer: Buffer, extension: string = '.tmp') {
    const tempFile = await createTempFile({ postfix: extension })
    await fsP.writeFile(tempFile.path, buffer)
    return tempFile
  }

  /**
   * 获取媒体文件大小
   */
  getMediaSize(buffer: Buffer): number {
    return buffer.length
  }

  /**
   * 检查媒体大小是否超限
   */
  isMediaTooLarge(buffer: Buffer, maxSize: number = 20 * 1024 * 1024): boolean {
    return buffer.length > maxSize
  }

  /**
   * 压缩图片（如果需要）
   */
  async compressImage(buffer: Buffer, maxSize: number = 5 * 1024 * 1024): Promise<Buffer> {
    try {
      // 如果文件已经小于限制，直接返回
      if (buffer.length <= maxSize) {
        return buffer
      }

      logger.info(`Compressing image: ${buffer.length} bytes > ${maxSize} bytes`)

      // 使用 file-type 检测类型
      const type = await fileTypeFromBuffer(buffer)
      const mime = type?.mime || 'image/jpeg'

      // 简单的格式检查 (Jimp 支持的格式)
      if (!['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/gif'].includes(mime)) {
        logger.warn(`Unsupported/Unnecessary image format for compression: ${mime}`)
        return buffer
      }

      // 使用 Jimp 读取图片
      const image = await Jimp.read(buffer)

      // 计算压缩目标
      let quality = 80
      // 获取原始宽高
      let width = image.bitmap.width
      let height = image.bitmap.height

      // 如果图片过大，先尝试调整尺寸
      // 限制最大边长为 1920
      const MAX_DIMENSION = 1920
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round(height * (MAX_DIMENSION / width))
          width = MAX_DIMENSION
        }
        else {
          width = Math.round(width * (MAX_DIMENSION / height))
          height = MAX_DIMENSION
        }
        logger.info(`Resizing image to ${width}x${height}`)
        image.resize({ w: width, h: height })
      }

      // 尝试压缩循环
      let compressedBuffer: Buffer

      // Jimp 无法直接输出 buffer 到 buffer 多次而不重新 encode
      // 对于 WebP，Jimp 可能不支持写入，统一转为 JPEG 或 PNG
      let targetMime = mime
      if (targetMime === 'image/webp') {
        targetMime = 'image/png' // WebP -> PNG
      }

      // 第一次尝试
      // Cast to any to avoid type issues with specific Jimp version definitions
      (image as any).quality(quality)
      compressedBuffer = await (image as any).getBuffer(targetMime)

      // 如果还是太大，继续降低质量
      while (compressedBuffer.length > maxSize && quality > 20) {
        quality -= 20
        logger.debug(`Image still too large (${compressedBuffer.length}), trying quality ${quality}`);
        (image as any).quality(quality)
        compressedBuffer = await (image as any).getBuffer(targetMime)
      }

      if (compressedBuffer.length > maxSize) {
        logger.warn(`Failed to compress image below ${maxSize} bytes even at quality ${quality}. Current: ${compressedBuffer.length}`)
      }

      logger.info(`Compression result: ${buffer.length} -> ${compressedBuffer.length} bytes (Quality: ${quality}, Format: ${targetMime})`)
      return compressedBuffer
    }
    catch (error) {
      logger.error('Image compression failed:', error)
      // 压缩失败返回原图
      return buffer
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    logger.info('MediaFeature destroyed')
  }
}
