import type { AudioContent, FileContent, ImageContent, MessageContent, UnifiedMessage, VideoContent } from '@napgram/message-kit'
import type { Instance } from '../../../shared-types'
import type { MediaFeature } from '../../MediaFeature'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileTypeFromBuffer } from 'file-type'
import { env } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'
import { silk } from '../../../shared-types'
import { renderContent } from '../utils/render'

const execFileAsync = promisify(execFile)

export class ForwardMediaPreparer {
  private readonly logger = getLogger('ForwardFeature')

  constructor(
    private readonly instance: Instance,
    private readonly media?: MediaFeature,
    private readonly contentRenderer: (content: MessageContent) => string = renderContent,
  ) { }

  /**
   * 为 QQ 侧填充媒体 Buffer/URL，提升兼容性。
   */
  async prepareMediaForQQ(msg: UnifiedMessage) {
    if (!this.media)
      return

    await Promise.all(msg.content.map(async (content) => {
      try {
        if (content.type === 'image') {
          // Skip file conversion for stickers - let toNapCat handle TGS conversion
          if ((content.data as any).isSticker) {
            this.logger.debug('Skipping file conversion for sticker, will be handled by toNapCat')
            // Keep the buffer/object as-is for toNapCat to process
            return
          }
          content.data.file = await this.ensureFilePath(
            await this.ensureBufferOrPath(content as ImageContent, { prefer: 'url', ext: '.jpg', prefix: 'tg-image' }),
            '.jpg',
          )
        }
        else if (content.type === 'video') {
          content.data.file = await this.ensureFilePath(
            await this.ensureBufferOrPath(content as VideoContent, { prefer: 'url', ext: '.mp4', prefix: 'tg-video' }),
            '.mp4',
            false,
          )
        }
        else if (content.type === 'audio') {
          const oggPath = await this.ensureFilePath(
            await this.ensureBufferOrPath(content as AudioContent, { forceDownload: true, prefer: 'path', ext: '.ogg', prefix: 'tg-audio' }),
            '.ogg',
            true,
          )
          if (oggPath) {
            try {
              const silkBuffer = await silk.encode(oggPath)
              const header = Buffer.from('#!SILK_V3', 'binary')
              const prefixedHeader = Buffer.from('\x02#!SILK_V3', 'binary')

              let finalBuffer = silkBuffer
              const hasPrefixedHeader = finalBuffer.subarray(0, prefixedHeader.length).equals(prefixedHeader)
              const hasHeader = finalBuffer.subarray(0, header.length).equals(header)

              // Ensure single prefixed header: if only "#!SILK_V3", add the \x02 prefix; if missing entirely, prepend full header.
              if (!hasPrefixedHeader) {
                finalBuffer = hasHeader
                  ? Buffer.concat([Buffer.from('\x02', 'binary'), finalBuffer])
                  : Buffer.concat([prefixedHeader, finalBuffer])
              }

              this.logger.debug(`Encoded silk buffer size: ${finalBuffer.length} (with prefixedHeader=${hasPrefixedHeader || hasHeader})`)
              content.data.file = await this.ensureFilePath(finalBuffer, '.silk', false)
            }
            catch (err) {
              this.logger.warn(err, 'Audio silk encode failed, fallback to file')
              content.type = 'file'
              content.data = {
                file: oggPath,
                filename: path.basename(oggPath),
              } as any
            }
          }
          else {
            content.data.file = undefined
          }
        }
        else if (content.type === 'file') {
          const file = content as FileContent
          content.data.file = await this.ensureFilePath(
            await this.ensureBufferOrPath(file, { prefer: 'url', filename: file.data.filename, prefix: 'tg-file' }),
            undefined,
          )
        }
      }
      catch (err) {
        this.logger.warn(err, 'Prepare media for QQ failed, skip media content:')
        content.type = 'text';
        (content as any).data = { text: this.contentRenderer(content) }
      }
    }))
  }

  async ensureBufferOrPath(
    content: ImageContent | VideoContent | AudioContent | FileContent,
    options?: { forceDownload?: boolean, prefer?: 'buffer' | 'path' | 'url', ext?: string, filename?: string, prefix?: string },
  ): Promise<Buffer | string | undefined> {
    const forceDownload = options?.forceDownload
    const prefer = options?.prefer || 'buffer'
    this.logger.debug(`[ensureBufferOrPath] Start - content.type: ${content.type}, forceDownload: ${forceDownload}, prefer: ${prefer}`)
    this.logger.debug(`[ensureBufferOrPath] content.data keys: ${Object.keys(content.data).join(', ')}`)

    if (content.data.file) {
      this.logger.debug(`[ensureBufferOrPath] content.data.file type: ${typeof content.data.file}, isBuffer: ${Buffer.isBuffer(content.data.file)}`)

      if (Buffer.isBuffer(content.data.file))
        return content.data.file
      if (typeof content.data.file === 'string') {
        if (!forceDownload && !/^https?:\/\//.test(content.data.file)) {
          try {
            this.logger.debug(`Processing media:\n${JSON.stringify(content, null, 2)}`)
            await fs.promises.access(content.data.file)
            this.logger.debug(`Media file exists locally: ${content.data.file}`)
            return content.data.file
          }
          catch {
            this.logger.debug(`Local media file not found or accessible, falling back to download: ${content.data.file}`)
          }
        }
        this.logger.debug(`[ensureBufferOrPath] Attempting URL download from: ${content.data.file}`)
        try {
          const result = await this.media?.downloadMedia(content.data.file)
          this.logger.debug(`[ensureBufferOrPath] URL download result: ${result ? `buffer(${result.length})` : 'undefined'}`)
          return result
        }
        catch (e) {
          this.logger.warn(e, 'Failed to download media by url')
        }
      }
      this.logger.debug(`[ensureBufferOrPath] Attempting TG object download. file object keys: ${Object.keys(content.data.file).join(', ')}`)
      try {
        const mediaObj = content.data.file as any
        this.logger.debug(`[ensureBufferOrPath] TG Media object structure: ${JSON.stringify(mediaObj, null, 2).substring(0, 500)}`)

        if (prefer === 'buffer') {
          const buffer = await this.instance.tgBot.downloadMedia(mediaObj)
          this.logger.debug(`Downloaded media buffer size: ${buffer?.length}`)

          if (!buffer || buffer.length === 0) {
            this.logger.warn('Downloaded buffer is empty, treating as failure')
            return undefined
          }
          return buffer as Buffer
        }

        const urlOrPath = await this.instance.tgBot.downloadMediaToTempFile(mediaObj, {
          prefix: options?.prefix,
          filename: options?.filename,
          ext: options?.ext,
          returnType: prefer === 'path' ? 'path' : 'url',
        })
        this.logger.debug(`[ensureBufferOrPath] TG download to temp success: ${urlOrPath}`)
        return urlOrPath
      }
      catch (e) {
        this.logger.error(e, 'Failed to download media from TG object:')
        this.logger.error(`[ensureBufferOrPath] TG download error details: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (content.data.url && this.media) {
      this.logger.debug(`[ensureBufferOrPath] Attempting download from content.data.url: ${content.data.url}`)
      try {
        const result = await this.media.downloadMedia(content.data.url)
        this.logger.debug(`[ensureBufferOrPath] URL download from data.url result: ${result ? `buffer(${result.length})` : 'undefined'}`)
        return result
      }
      catch (e) {
        this.logger.error(e, '[ensureBufferOrPath] Failed to download from data.url:')
      }
    }
    this.logger.warn('[ensureBufferOrPath] All download attempts failed, returning undefined')
    return undefined
  }

  async ensureFilePath(file: Buffer | string | undefined, ext?: string, forceLocal?: boolean) {
    if (!file)
      return undefined
    if (Buffer.isBuffer(file)) {
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext || ''}`
      const tempDir = path.join(env.DATA_DIR, 'temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const tempPath = path.join(tempDir, filename)
      await fs.promises.writeFile(tempPath, file)

      if (!forceLocal) {
        if (env.INTERNAL_WEB_ENDPOINT) {
          return `${env.INTERNAL_WEB_ENDPOINT}/temp/${filename}`
        }
        if (env.WEB_ENDPOINT) {
          return `${env.WEB_ENDPOINT}/temp/${filename}`
        }
        return `http://napgram-dev:8080/temp/${filename}`
      }
      return tempPath
    }
    return file
  }

  async prepareAudioSource(audioContent: AudioContent, processedFile?: Buffer | string) {
    let source: Buffer | string | undefined = processedFile

    if (!source && typeof audioContent.data.file === 'string') {
      let candidate = audioContent.data.file
      if (candidate.endsWith('.amr')) {
        const wavPath = `${candidate}.wav`
        try {
          await fs.promises.access(wavPath)
          candidate = wavPath
        }
        catch {
        }
      }
      if (await this.waitFileStable(candidate)) {
        source = candidate
      }
    }

    if (!source && audioContent.data.url && this.media) {
      const buf = await this.media.downloadMedia(audioContent.data.url)
      const tempPath = await this.ensureFilePath(buf, '.amr', true)
      source = tempPath || buf
    }

    if (source) {
      let buffer: Buffer | undefined
      if (Buffer.isBuffer(source)) {
        buffer = source
      }
      else {
        try {
          buffer = await fs.promises.readFile(source)
        }
        catch {
          buffer = undefined
        }
      }
      if (buffer) {
        const ft = await fileTypeFromBuffer(buffer)
        if (!ft && audioContent.data.url && this.media) {
          const buf = await this.media.downloadMedia(audioContent.data.url)
          const tempPath = await this.ensureFilePath(buf, '.amr', true)
          source = tempPath || buf
        }
      }
    }

    if (!source) {
      source = await this.ensureBufferOrPath(audioContent, { forceDownload: true, prefer: 'path', prefix: 'tg-audio' })
    }
    return source
  }

  private async waitFileStable(filePath: string, attempts = 3, intervalMs = 150) {
    if (!filePath)
      return false
    let lastSize = -1
    for (let i = 0; i < attempts; i++) {
      try {
        const stat = await fs.promises.stat(filePath)
        if (stat.size > 0 && stat.size === lastSize) {
          return true
        }
        lastSize = stat.size
      }
      catch {
      }
      await new Promise(r => setTimeout(r, intervalMs))
    }
    try {
      await fs.promises.access(filePath)
      return true
    }
    catch {
      return false
    }
  }

  async convertAudioToOgg(source: Buffer | string): Promise<{ voicePath?: string, fallbackPath?: string }> {
    const tempDir = path.join(env.DATA_DIR, 'temp')
    await fs.promises.mkdir(tempDir, { recursive: true })

    let inputPath: string
    let inputBuffer: Buffer

    if (typeof source === 'string') {
      inputPath = source
      inputBuffer = await fs.promises.readFile(inputPath)
    }
    else {
      inputBuffer = source
      inputPath = path.join(tempDir, `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.amr`)
      await fs.promises.writeFile(inputPath, source)
    }

    const outputPath = path.join(tempDir, `audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`)

    try {
      if (inputBuffer.length >= 10 && inputBuffer.subarray(0, 10).toString('utf8').includes('SILK_V3')) {
        await silk.decode(inputBuffer, outputPath)
        return { voicePath: outputPath }
      }
    }
    catch (e) {
      this.logger.warn(e, 'SILK decode failed (pre-ffmpeg):')
    }

    const tryConvert = async (inPath: string) => {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inPath,
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-ar',
        '48000',
        '-ac',
        '1',
        outputPath,
      ])
      return outputPath
    }

    try {
      return { voicePath: await tryConvert(inputPath) }
    }
    catch (firstErr) {
      this.logger.warn(firstErr, 'ffmpeg convert audio failed, try wav fallback or send raw')
      if (typeof source === 'string') {
        const wavPath = `${inputPath}.wav`
        try {
          await fs.promises.access(wavPath)
          return { voicePath: await tryConvert(wavPath) }
        }
        catch {
        }
      }
      try {
        await silk.decode(inputBuffer, outputPath)
        return { voicePath: outputPath }
      }
      catch (silkErr) {
        this.logger.warn(silkErr, 'Silk decode fallback failed')
      }
      return { fallbackPath: inputPath }
    }
  }
}
