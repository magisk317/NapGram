import fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TEMP_PATH, createTempFile } from '../temp'

describe('temp utils', () => {
  it('creates a temp path under TEMP_PATH', async () => {
    const temp = await createTempFile({ postfix: '.log' })

    expect(path.dirname(temp.path)).toBe(TEMP_PATH)
    expect(temp.path.endsWith('.log')).toBe(true)
  })

  it('cleanup removes created file', async () => {
    const temp = await createTempFile()

    await writeFile(temp.path, 'test')
    expect(fs.existsSync(temp.path)).toBe(true)

    await temp.cleanup()

    expect(fs.existsSync(temp.path)).toBe(false)
  })

  it('creates temp dir when missing on module init', async () => {
    vi.resetModules()
    const existsSync = vi.fn().mockReturnValue(false)
    const mkdirSync = vi.fn()

    vi.doMock('node:fs', () => ({
      default: { existsSync, mkdirSync },
      existsSync,
      mkdirSync,
    }))
    vi.doMock('../../../domain/models/env', () => ({
      default: { DATA_DIR: '/tmp/napgram' },
    }))

    const module = await import('../temp')

    expect(existsSync).toHaveBeenCalledWith(module.TEMP_PATH)
    expect(mkdirSync).toHaveBeenCalledWith(module.TEMP_PATH, { recursive: true })
  })
})
