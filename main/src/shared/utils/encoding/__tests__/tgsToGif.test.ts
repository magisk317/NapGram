import { describe, expect, it, vi, beforeEach } from 'vitest'
import tgsToGif from '../tgsToGif'
import fsP from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { execFile } from 'node:child_process'

vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}))

vi.mock('node:zlib', () => ({
    gunzipSync: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
    default: {
        mkdtemp: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readdir: vi.fn(),
        rm: vi.fn()
    }
}))

vi.mock('../../logger', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    }))
}))

describe('tgsToGif', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should convert tgs to gif', async () => {
        vi.mocked(fsP.mkdtemp).mockResolvedValue('/tmp/dir')
        vi.mocked(fsP.readFile).mockResolvedValue(Buffer.from('tgs'))
        vi.mocked(gunzipSync).mockReturnValue(Buffer.from('json'))

        // execFile lottie_to_png
        vi.mocked(execFile).mockImplementation((cmd, _args, cb: any) => {
            cb(null)
            return {} as any
        })

        // readdir returns pngs
        vi.mocked(fsP.readdir).mockResolvedValue(['frame1.png', 'frame2.png'] as any)

        const res = await tgsToGif('in.tgs', 'out.gif')

        expect(res).toBe('out.gif')
        expect(gunzipSync).toHaveBeenCalled()
        expect(execFile).toHaveBeenCalledWith('/usr/bin/lottie_to_png', expect.any(Array), expect.any(Function))
        expect(execFile).toHaveBeenCalledWith('/usr/bin/gifski', expect.any(Array), expect.any(Function))
        expect(fsP.rm).toHaveBeenCalledWith('/tmp/dir', { recursive: true, force: true })
    })

    it('should throw if no pngs', async () => {
        vi.mocked(fsP.mkdtemp).mockResolvedValue('/tmp/dir')
        vi.mocked(fsP.readFile).mockResolvedValue(Buffer.from('tgs'))
        vi.mocked(gunzipSync).mockReturnValue(Buffer.from('json'))
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => { cb(null); return {} as any })
        vi.mocked(fsP.readdir).mockResolvedValue([] as any)

        await expect(tgsToGif('in.tgs')).rejects.toThrow('No PNG frames')
        expect(fsP.rm).toHaveBeenCalled()
    })

    it('should cleanup even on error', async () => {
        vi.mocked(fsP.mkdtemp).mockResolvedValue('/tmp/dir')
        vi.mocked(fsP.readFile).mockRejectedValue(new Error('Read fail'))

        await expect(tgsToGif('in.tgs')).rejects.toThrow('Read fail')
        expect(fsP.rm).toHaveBeenCalled()
    })

    it('should log warning if cleanup fails', async () => {
        vi.mocked(fsP.mkdtemp).mockResolvedValue('/tmp/dir')
        vi.mocked(fsP.readFile).mockRejectedValue(new Error('Fail'))
        vi.mocked(fsP.rm).mockRejectedValue(new Error('Rm fail'))

        await expect(tgsToGif('in.tgs')).rejects.toThrow('Fail')
        expect(fsP.rm).toHaveBeenCalled()
    })
})
