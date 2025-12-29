import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import convert from '../convert'

const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}))

const fsPromMocks = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 10 }),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}))

const envMock = vi.hoisted(() => ({
  CACHE_DIR: '/cache',
  DATA_DIR: '/data',
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const fileTypeMocks = vi.hoisted(() => ({
  fileTypeFromBuffer: vi.fn(),
}))

const jimpMocks = vi.hoisted(() => ({
  read: vi.fn(),
}))

const ffmpegMocks = vi.hoisted(() => ({
  convertWithFfmpeg: vi.fn().mockResolvedValue(undefined),
}))

const tgsMocks = vi.hoisted(() => ({
  tgsToGif: vi.fn().mockResolvedValue(undefined),
}))

const tempMocks = vi.hoisted(() => ({
  file: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: fsMocks.mkdirSync,
    existsSync: fsMocks.existsSync,
  },
  mkdirSync: fsMocks.mkdirSync,
  existsSync: fsMocks.existsSync,
}))

vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: fsPromMocks.writeFile,
    mkdir: fsPromMocks.mkdir,
    stat: fsPromMocks.stat,
    unlink: fsPromMocks.unlink,
    readFile: fsPromMocks.readFile,
  },
  writeFile: fsPromMocks.writeFile,
  mkdir: fsPromMocks.mkdir,
  stat: fsPromMocks.stat,
  unlink: fsPromMocks.unlink,
  readFile: fsPromMocks.readFile,
}))

vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeMocks.fileTypeFromBuffer,
}))

vi.mock('jimp', () => ({
  Jimp: {
    read: jimpMocks.read,
  },
}))

vi.mock('../../../domain/models/env', () => ({
  default: envMock,
}))

vi.mock('../../logger', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../encoding/convertWithFfmpeg', () => ({
  default: ffmpegMocks.convertWithFfmpeg,
}))

vi.mock('../encoding/tgsToGif', () => ({
  default: tgsMocks.tgsToGif,
}))

vi.mock('../temp', () => ({
  file: tempMocks.file,
}))

describe('convert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    fsMocks.existsSync.mockReturnValue(false)
  })

  it('caches conversion when missing', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const result = await convert.cached('item', handler)

    expect(handler).toHaveBeenCalledWith('/cache/item')
    expect(result).toBe('/cache/item')
  })

  it('returns cached path when already exists', async () => {
    fsMocks.existsSync.mockReturnValue(true)
    const handler = vi.fn()

    const result = await convert.cached('item', handler)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBe('/cache/item')
  })

  it('writes cached buffer to disk', async () => {
    await convert.cachedBuffer('buffer', async () => Buffer.from('data'))

    expect(fsPromMocks.writeFile).toHaveBeenCalledWith('/cache/buffer', expect.any(Buffer))
  })

  it('converts webp to png via Jimp', async () => {
    const image = { write: vi.fn().mockResolvedValue(undefined) }
    jimpMocks.read.mockResolvedValue(image)

    const result = await convert.png('image', async () => Buffer.from('webp'))

    expect(result).toBe('/cache/image.png')
    expect(jimpMocks.read).toHaveBeenCalled()
    expect(image.write).toHaveBeenCalledWith('/cache/image.png')
  })

  it('converts video to gif using temp file and ffmpeg', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    tempMocks.file.mockResolvedValue({ path: '/tmp/video', cleanup })

    const result = await convert.video2gif('video', async () => Buffer.from('webm'), true)

    expect(result).toBe('/cache/video.gif')
    expect(fsPromMocks.writeFile).toHaveBeenCalledWith('/tmp/video', expect.any(Buffer))
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/tmp/video', '/cache/video.gif', 'gif', 'libvpx-vp9')
    expect(cleanup).toHaveBeenCalled()
  })

  it('converts video to gif with default codec', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    tempMocks.file.mockResolvedValue({ path: '/tmp/video-default', cleanup })

    const result = await convert.video2gif('video-default', async () => Buffer.from('webm'), false)

    expect(result).toBe('/cache/video-default.gif')
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/tmp/video-default', '/cache/video-default.gif', 'gif', undefined)
    expect(cleanup).toHaveBeenCalled()
  })
  it('converts TGS buffer to gif and cleans up temp file', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const result = await convert.tgs2gif('sticker', async () => Buffer.from([1, 2, 3]))

    expect(result).toBe('/cache/sticker.gif')
    expect(fsPromMocks.mkdir).toHaveBeenCalledWith('/data/temp', { recursive: true })
    expect(fsPromMocks.writeFile).toHaveBeenCalledWith(expect.stringContaining('/data/temp/sticker-'), expect.any(Buffer))
    expect(tgsMocks.tgsToGif).toHaveBeenCalled()
    expect(fsPromMocks.unlink).toHaveBeenCalled()
  })

  it('converts TGS file path directly', async () => {
    const result = await convert.tgs2gif('sticker', async () => '/tmp/file.tgs')

    expect(result).toBe('/cache/sticker.gif')
    expect(tgsMocks.tgsToGif).toHaveBeenCalledWith('/tmp/file.tgs', '/cache/sticker.gif')
  })

  it('chooses webm conversion for gif input', async () => {
    const cachedSpy = vi.spyOn(convert, 'cachedBuffer').mockResolvedValue('/cache/key')
    const webmSpy = vi.spyOn(convert, 'webm').mockResolvedValue('/cache/key.webm')
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/gif' })

    const result = await convert.webpOrWebm('key', async () => Buffer.from('gif'))

    expect(cachedSpy).toHaveBeenCalled()
    expect(webmSpy).toHaveBeenCalledWith('key', '/cache/key')
    expect(result).toBe('/cache/key.webm')
  })

  it('chooses png conversion for non-gif input', async () => {
    const cachedSpy = vi.spyOn(convert, 'cachedBuffer').mockResolvedValue('/cache/key')
    const webpSpy = vi.spyOn(convert, 'webp').mockImplementation(async (_key, imageData) => {
      await imageData()
      return '/cache/key.png'
    })
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' })

    const result = await convert.webpOrWebm('key', async () => Buffer.from('png'))

    expect(cachedSpy).toHaveBeenCalled()
    expect(webpSpy).toHaveBeenCalled()
    expect(result).toBe('/cache/key.png')
  })

  it('returns cached custom emoji when small size already exists', async () => {
    fsMocks.existsSync.mockImplementation(path => path === '/cache/emoji@50.png')

    const result = await convert.customEmoji('emoji', async () => Buffer.from('data'), true)

    expect(result).toBe('/cache/emoji@50.png')
  })

  it('tgs2gif handles conversion failure', async () => {
    vi.mocked(tgsMocks.tgsToGif).mockRejectedValueOnce(new Error('Conversion failed'))
    // Spy on logger
    const loggerSpy = loggerMocks.error

    await expect(convert.tgs2gif('fail', async () => Buffer.from('tgs'))).rejects.toThrow('Conversion failed')
    expect(loggerSpy).toHaveBeenCalled()
  })

  it('tgs2gif logs non-error failures', async () => {
    vi.mocked(tgsMocks.tgsToGif).mockRejectedValueOnce('bad')

    await expect(convert.tgs2gif('fail-str', async () => Buffer.from('tgs'))).rejects.toBe('bad')

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.stringContaining('[tgs2gif] Error details:'),
    )
  })

  it('tgs2gif throws if output file missing', async () => {
    // fs stat fails (default mock return value is {size: 10}, need to override)
    fsPromMocks.stat.mockRejectedValueOnce(new Error('no ent'))

    await expect(convert.tgs2gif('missing', async () => Buffer.from('tgs'))).rejects.toThrow('TGS to GIF conversion produced no output file')
  })

  it('tgs2gif handles unsupported source', async () => {
    await expect(convert.tgs2gif('bad', async () => 123 as any)).rejects.toThrow('Unsupported sticker source type')
  })

  it('customEmoji generates small size from png', async () => {
    // fileType returns image/png
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' })

    // Jimp read (original), resize, write
    const image = { resize: vi.fn().mockReturnThis(), write: vi.fn() }
    jimpMocks.read.mockResolvedValue(image)

    const res = await convert.customEmoji('e1', async () => Buffer.from('png'), true)
    expect(res).toBe('/cache/e1@50.png')
    expect(image.resize).toHaveBeenCalledWith({ w: 50 })
  })

  it('customEmoji returns original size when not using small size', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' })
    const image = { write: vi.fn().mockResolvedValue(undefined) }
    jimpMocks.read.mockResolvedValue(image)

    const res = await convert.customEmoji('e_full', async () => Buffer.from('png'), false)

    expect(res).toBe('/cache/e_full.png')
    expect(jimpMocks.read).toHaveBeenCalled()
  })

  it('customEmoji falls back to default image type when fileType is missing', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue(undefined)
    const image = { write: vi.fn().mockResolvedValue(undefined) }
    jimpMocks.read.mockResolvedValue(image)

    const res = await convert.customEmoji('e_fallback', async () => Buffer.from('png'), false)

    expect(res).toBe('/cache/e_fallback.png')
  })

  it('customEmoji returns gif when non-image and not using small size', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'application/octet-stream' })

    const res = await convert.customEmoji('e_full_gif', async () => Buffer.from('tgs'), false)

    expect(res).toBe('/cache/e_full_gif.gif')
  })

  it('customEmoji generates small size from gif (tgs fallback)', async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: 'application/octet-stream' }) // not image/
    // tgs2gif called. It calls tgsToGif.
    tgsMocks.tgsToGif.mockResolvedValue('/cache/e2.gif')

    const image = { resize: vi.fn().mockReturnThis(), write: vi.fn() }
    jimpMocks.read.mockResolvedValue(image)

    const res = await convert.customEmoji('e2', async () => Buffer.from('tgs'), true)
    // Fallback flow: tgs2gif -> e2.gif. Then cachedConvert e2@50.gif -> resize e2.gif -> write.
    expect(res).toBe('/cache/e2@50.gif')
  })

  it('converts webp to png', async () => {
    const image = { write: vi.fn().mockResolvedValue(undefined) }
    jimpMocks.read.mockResolvedValue(image)

    const res = await convert.webp('w1', async () => Buffer.from('webp'))

    expect(res).toBe('/cache/w1.png')
    expect(jimpMocks.read).toHaveBeenCalled()
    expect(image.write).toHaveBeenCalledWith('/cache/w1.png')
  })

  it('converts webm', async () => {
    // ffmpeg call
    const res = await convert.webm('wb1', '/tmp/in.webm')
    expect(res).toBe('/cache/wb1.webm')
    expect(ffmpegMocks.convertWithFfmpeg).toHaveBeenCalledWith('/tmp/in.webm', '/cache/wb1.webm', 'webm')
  })

  it('customEmoji returns existing normal size', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => p === '/cache/e_exist.png')
    const res = await convert.customEmoji('e_exist', async () => Buffer.from(''), false)
    expect(res).toBe('/cache/e_exist.png')
  })

  it('customEmoji returns existing normal size GIF', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => p === '/cache/e_exist_gif.gif')
    const res = await convert.customEmoji('e_exist_gif', async () => Buffer.from(''), false)
    expect(res).toBe('/cache/e_exist_gif.gif')
  })

  it('customEmoji returns existing small size GIF', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => p === '/cache/e_small_gif@50.gif')
    const res = await convert.customEmoji('e_small_gif', async () => Buffer.from(''), true)
    expect(res).toBe('/cache/e_small_gif@50.gif')
  })

  it('tgs2gif throws on direct file conversion failure', async () => {
    vi.mocked(tgsMocks.tgsToGif).mockRejectedValueOnce(new Error('Direct fail'))
    // Input is string path ending in .tgs
    await expect(convert.tgs2gif('key', async () => '/path/to.tgs')).rejects.toThrow('Direct fail')
  })

  it('tgs2gif warns on cleanup failure', async () => {
    // fs unlink fails
    fsPromMocks.unlink.mockRejectedValueOnce(new Error('unlink failed'))

    await convert.tgs2gif('cleanup_fail', async () => Buffer.from('tgs'))

    expect(loggerMocks.warn).toHaveBeenCalledWith(expect.any(Error), '[tgs2gif] Failed to cleanup temp TGS file')
  })
})
