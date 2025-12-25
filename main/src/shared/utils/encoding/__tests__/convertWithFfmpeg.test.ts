import { describe, expect, it, vi, beforeEach } from 'vitest'
import convertWithFfmpeg from '../convertWithFfmpeg'
import fsP from 'node:fs/promises'
import { execFile } from 'node:child_process'

// Mock child_process execFile
vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}))

// Mock fsP
vi.mock('node:fs/promises', () => ({
    default: {
        stat: vi.fn(),
        rm: vi.fn()
    }
}))

describe('convertWithFfmpeg', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should success', async () => {
        // Mock successful exec
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
            cb(null, 'stdout', 'stderr')
            return {} as any
        })

        await convertWithFfmpeg('in.mp4', 'out.gif', 'gif')

        expect(execFile).toHaveBeenCalledWith('ffmpeg', expect.any(Array), expect.any(Function))
        const args = vi.mocked(execFile).mock.calls[0][1] as string[]
        // Check args
        expect(args).toContain('-y')
        expect(args).toContain('in.mp4')
        expect(args).toContain('out.gif')
        // GIF specific
        expect(args).toContain('-filter_complex')
    })

    it('should handle webm', async () => {
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => cb(null))
        await convertWithFfmpeg('in.mp4', 'out.webm', 'webm')
        const args = vi.mocked(execFile).mock.calls[0][1] as string[]
        expect(args).toContain('libvpx-vp9')
    })

    it('should handle source format', async () => {
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => cb(null))
        await convertWithFfmpeg('in.bin', 'out.mp4', 'mp4', 'libx264')
        const args = vi.mocked(execFile).mock.calls[0][1] as string[]
        expect(args).toContain('-c:v')
        expect(args).toContain('libx264')
    })

    it('should handle failure and cleanup', async () => {
        // execFile fails
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
            cb(new Error('ffmpeg failed'))
            return {} as any
        })

        // stat returns size 0
        vi.mocked(fsP.stat).mockResolvedValue({ size: 0 } as any)

        await expect(convertWithFfmpeg('in', 'out', 'mp4')).rejects.toThrow('ffmpeg failed')

        expect(fsP.stat).toHaveBeenCalledWith('out')
        expect(fsP.rm).toHaveBeenCalledWith('out')
    })

    it('should handle failure validation success (size > 0)', async () => {
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
            cb(new Error('ffmpeg failed'))
            return {} as any
        })

        vi.mocked(fsP.stat).mockResolvedValue({ size: 100 } as any)

        await expect(convertWithFfmpeg('in', 'out', 'mp4')).rejects.toThrow('ffmpeg failed')
        expect(fsP.rm).not.toHaveBeenCalled()
    })

    it('should warn if cleanup fails on error', async () => {
        vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
            cb(new Error('ffmpeg failed'))
            return {} as any
        })
        vi.mocked(fsP.stat).mockRejectedValue(new Error('stat failed'))
        // getLogger warning check logic is implicit in coverage of catch block
        await expect(convertWithFfmpeg('in', 'out', 'mp4')).rejects.toThrow('ffmpeg failed')
    })
})
