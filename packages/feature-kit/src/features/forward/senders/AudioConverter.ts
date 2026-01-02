import type { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { env } from '@napgram/infra-kit'
import { getLogger } from '@napgram/infra-kit'
import { silk } from '../../../shared-types'

const execFileAsync = promisify(execFile)

export interface NormalizedFile {
  fileName: string
  data: Buffer
  fileMime?: string
}

/**
 * Audio conversion utilities for Telegram voice messages
 * Handles OGG/Opus encoding and SILK decoding
 */
export class AudioConverter {
  private readonly logger = getLogger('AudioConverter')

  /**
   * Prepare voice media for Telegram (convert to OGG/Opus)
   */
  async prepareVoiceMedia(file: NormalizedFile) {
    const ogg = await this.convertAudioToOgg(file)
    if (ogg) {
      return { type: 'voice', file: ogg.data, fileName: ogg.fileName, fileMime: 'audio/ogg' }
    }

    this.logger.warn('Audio conversion failed, fallback to document upload for Telegram')
    return {
      type: 'document',
      file: file.data,
      fileName: file.fileName,
      ...(file.fileMime ? { fileMime: file.fileMime } : {}),
    }
  }

  /**
   * Convert audio file to OGG/Opus format for Telegram
   */
  async convertAudioToOgg(file: NormalizedFile): Promise<NormalizedFile | undefined> {
    const alreadyOgg = file.fileMime === 'audio/ogg' || file.fileName.toLowerCase().endsWith('.ogg')
    if (alreadyOgg) {
      return { ...file, fileName: this.ensureOggFileName(file.fileName), fileMime: 'audio/ogg' }
    }

    const header = file.data.subarray(0, 10).toString('utf8')
    const isSilk = header.includes('SILK_V3')

    const oggBuffer = await this.transcodeToOgg(file.data, file.fileName, isSilk)
    if (!oggBuffer)
      return undefined

    return {
      fileName: this.ensureOggFileName(file.fileName),
      data: oggBuffer,
      fileMime: 'audio/ogg',
    }
  }

  /**
   * Ensure filename has .ogg extension
   */
  ensureOggFileName(name: string) {
    const parsed = path.parse(name || 'audio')
    const base = parsed.name || 'audio'
    return `${base}.ogg`
  }

  /**
   * Transcode audio to OGG/Opus using SILK or FFmpeg
   */
  async transcodeToOgg(data: Buffer, sourceName: string, preferSilk?: boolean): Promise<Buffer | undefined> {
    const tempDir = path.join(env.DATA_DIR, 'temp')
    await fs.promises.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, `tg-audio-${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(sourceName) || '.tmp'}`)
    const outputPath = path.join(tempDir, `tg-audio-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`)

    await fs.promises.writeFile(inputPath, data)

    try {
      if (preferSilk) {
        try {
          await silk.decode(data, outputPath)
          return await fs.promises.readFile(outputPath)
        }
        catch (err) {
          this.logger.warn(err, 'Silk decode failed, fallback to ffmpeg')
        }
      }

      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inputPath,
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
      return await fs.promises.readFile(outputPath)
    }
    catch (err) {
      this.logger.error(err, 'Audio transcode failed:')
      return undefined
    }
    finally {
      fs.promises.unlink(inputPath).catch(() => { })
      fs.promises.unlink(outputPath).catch(() => { })
    }
  }
}
