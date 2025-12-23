import type { MessageContent, UnifiedMessage } from '../types'
import { Buffer } from 'node:buffer'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import env from '../../models/env'
import { BaseConverter } from './BaseConverter'

export class UnifiedConverter extends BaseConverter {
  /**
   * 统一格式转换为 NapCat 格式
   */
  async toNapCat(message: UnifiedMessage): Promise<any[]> {
    const segments: any[] = []

    for (const content of message.content) {
      switch (content.type) {
        case 'text':
          segments.push({
            type: 'text',
            data: { text: content.data.text },
          })
          break

        case 'image':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'image', '.jpg')
            }
            segments.push({
              type: 'image',
              data: {
                file,
                sub_type: content.data.isSpoiler ? '7' : '0',
              },
            })
          }
          break

        case 'video':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'video', '.mp4')
            }
            segments.push({
              type: 'video',
              data: {
                file,
              },
            })
          }
          break

        case 'audio':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'audio', '.ogg')
            }
            segments.push({
              type: 'record',
              data: {
                file,
              },
            })
          }
          break

        case 'file':
          {
            let file = content.data.url || content.data.file
            if (Buffer.isBuffer(file)) {
              file = await this.saveBufferToTemp(file, 'file', '', content.data.filename)
            }
            segments.push({
              type: 'file',
              data: {
                file,
                name: content.data.filename,
              },
            })
          }
          break

        case 'at':
          {
            const raw = String(content.data?.userId ?? content.data?.targetId ?? content.data?.qq ?? content.data?.user ?? '').trim()
            // NapCat/QQ only supports numeric uin mentions; non-numeric falls back to plain text.
            if (!/^\d+$/.test(raw)) {
              const name = String(content.data?.userName ?? content.data?.name ?? raw).trim()
              const text = name.startsWith('@') ? name : `@${name}`
              segments.push({ type: 'text', data: { text } })
              break
            }
            segments.push({
              type: 'at',
              data: { qq: raw },
            })
          }
          break

        case 'reply':
          segments.push({
            type: 'reply',
            data: content.data, // Pass through all fields (id, seq, time, senderUin, peer, etc.)
          })
          break

        case 'sticker':
          segments.push({
            type: 'image',
            data: {
              file: content.data.url || content.data.file,
            },
          })
          break
      }
    }
    return segments
  }

  /**
   * 统一格式转换为 Telegram 格式
   */
  toTelegram(msg: UnifiedMessage): any {
    const result: any = {
      message: '',
      media: [] as MessageContent[],
    }

    for (const content of msg.content) {
      switch (content.type) {
        case 'text':
          result.message += content.data.text
          break
        default:
          result.media.push(content)
          break
      }
    }

    return result
  }

  private async saveBufferToTemp(buffer: Buffer, type: 'image' | 'video' | 'audio' | 'file', ext: string, filename?: string): Promise<string> {
    // 尝试使用 NapCat 共享目录 (假设 NapCat 容器内路径也是 /app/.config/QQ)
    const sharedRoot = '/app/.config/QQ'
    const sharedDir = path.join(sharedRoot, 'temp_napgram_share')

    if (fsSync.existsSync(sharedRoot)) {
      try {
        await fs.mkdir(sharedDir, { recursive: true })
        const name = filename || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`
        const filePath = path.join(sharedDir, name)
        await fs.writeFile(filePath, buffer)
        this.logger.debug(`Saved buffer to shared path: ${filePath}`)
        return filePath
      }
      catch (e) {
        this.logger.warn(e, `Failed to write to shared dir ${sharedDir}:`)
      }
    }

    // 回退到内部 HTTP 服务
    const tempDir = path.join(env.DATA_DIR, 'temp')
    await fs.mkdir(tempDir, { recursive: true })
    const name = filename || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`
    const filePath = path.join(tempDir, name)
    await fs.writeFile(filePath, buffer)

    const baseUrl = env.INTERNAL_WEB_ENDPOINT || 'http://napgram:8080'
    const url = `${baseUrl}/temp/${name}`
    this.logger.debug(`Saved buffer to local temp and returning URL: ${url}`)
    return url
  }
}
