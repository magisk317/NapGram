import { describe, expect, it, vi, beforeEach } from 'vitest'
import silk from '../silk'
import { decode, encode } from 'silk-wasm'
import { execFile } from 'node:child_process'
import { file } from '../../temp'
import fsP from 'node:fs/promises'

vi.mock('silk-wasm', () => ({
    decode: vi.fn(),
    encode: vi.fn()
}))

vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}))

vi.mock('../../temp', () => ({
    file: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
    default: {
        writeFile: vi.fn(),
        readFile: vi.fn()
    }
}))

describe('silk utility', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should decode silk to ogg', async () => {
        vi.mocked(decode).mockResolvedValue({ data: new Uint8Array(10), duration: 1 } as any)
        const cleanup = vi.fn()
        vi.mocked(file).mockResolvedValue({ path: '/tmp/pcm', cleanup })
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => { cb(null); return {} as any })

        await silk.decode(Buffer.from('silk'), 'out.ogg')

        expect(decode).toHaveBeenCalled()
        expect(fsP.writeFile).toHaveBeenCalledWith('/tmp/pcm', expect.any(Buffer))
        expect(execFile).toHaveBeenCalledWith('ffmpeg', expect.any(Array), expect.any(Function))
        expect(cleanup).toHaveBeenCalled()
    })

    it('should encode audio to silk', async () => {
        const cleanup = vi.fn()
        vi.mocked(file).mockResolvedValue({ path: '/tmp/pcm', cleanup })
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => { cb(null); return {} as any })
        vi.mocked(fsP.readFile).mockResolvedValue(Buffer.from('pcm'))
        vi.mocked(encode).mockResolvedValue({ data: new Uint8Array(10) } as any)

        const res = await silk.encode('in.mp3')

        expect(execFile).toHaveBeenCalled() // ffmpeg to pcm
        expect(fsP.readFile).toHaveBeenCalledWith('/tmp/pcm')
        expect(encode).toHaveBeenCalled()
        expect(res).toBeInstanceOf(Buffer)
        expect(cleanup).toHaveBeenCalled()
    })
})
