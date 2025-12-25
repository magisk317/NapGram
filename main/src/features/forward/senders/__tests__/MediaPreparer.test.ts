import fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import env from '../../../../domain/models/env'
import { ForwardMediaPreparer } from '../MediaPreparer'

describe('forwardMediaPreparer', () => {
  const instance = {
    tgBot: {
      downloadMedia: vi.fn(),
      downloadMediaToTempFile: vi.fn(),
    },
  }
  const media = {
    downloadMedia: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes buffer to temp file when forceLocal is true', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    const buffer = Buffer.from('data')

    const localPath = await preparer.ensureFilePath(buffer, '.bin', true)

    expect(localPath).toBeTruthy()
    expect(fs.existsSync(localPath!)).toBe(true)

    await fs.promises.unlink(localPath!)
  })

  it('returns local file path when file exists', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    const tempDir = path.join(env.DATA_DIR, 'temp')
    await fs.promises.mkdir(tempDir, { recursive: true })

    const filePath = path.join(tempDir, `test-${Date.now()}.txt`)
    await writeFile(filePath, 'hello')

    const content: any = { type: 'image', data: { file: filePath } }
    const result = await preparer.ensureBufferOrPath(content, { prefer: 'buffer' })

    expect(result).toBe(filePath)

    await fs.promises.unlink(filePath)
  })

  it('uses tgBot download for media objects when prefer path', async () => {
    const preparer = new ForwardMediaPreparer(instance as any, media as any)
    vi.mocked(instance.tgBot.downloadMediaToTempFile).mockResolvedValue('/tmp/media.bin')

    const content: any = { type: 'image', data: { file: { id: '1' } } }
    const result = await preparer.ensureBufferOrPath(content, { prefer: 'path', ext: '.jpg', prefix: 'tg-image' })

    expect(instance.tgBot.downloadMediaToTempFile).toHaveBeenCalled()
    expect(result).toBe('/tmp/media.bin')
  })
})
