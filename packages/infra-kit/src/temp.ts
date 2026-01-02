import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import env from './env'

export const TEMP_PATH = join(env.DATA_DIR, 'temp')

// Initialize lazily to avoid permission issues when only importing.
let tempDirInitialized = false
function ensureTempDir() {
    if (!tempDirInitialized) {
        if (!fs.existsSync(TEMP_PATH)) {
            fs.mkdirSync(TEMP_PATH, { recursive: true })
        }
        tempDirInitialized = true
    }
}

export async function createTempFile(options?: { postfix?: string, prefix?: string }) {
    ensureTempDir()
    const filename = `temp-${randomBytes(6).toString('hex')}${options?.postfix || '.tmp'}`
    const filePath = join(TEMP_PATH, filename)

    return {
        path: filePath,
        cleanup: async () => {
            try {
                await rm(filePath, { force: true })
            }
            catch { }
        },
    }
}

export const file = createTempFile
