import { mkdtemp, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import env from '../../domain/models/env';
import fs from 'fs';

export const TEMP_PATH = join(env.DATA_DIR, 'temp');

// Ensure temp dir exists synchronously on startup to avoid race conditions
if (!fs.existsSync(TEMP_PATH)) {
    fs.mkdirSync(TEMP_PATH, { recursive: true });
}

export async function createTempFile(options?: { postfix?: string, prefix?: string }) {
    const filename = `temp-${randomBytes(6).toString('hex')}${options?.postfix || '.tmp'}`;
    const filePath = join(TEMP_PATH, filename);

    // Touch the file to ensure it exists (optional, but standard for mktemp behavior)
    // Actually mkdtemp creates a directory. The user code expected a file path inside a new random dir?
    // Original code: await mkdtemp(join(tmpdir(), prefix)); -> This creates a DIR.
    // AND: const filename = ...; const filePath = join(tempDir, filename);
    // So it created a random directory, and then a random filename inside it.
    // This allows easy cleanup of the whole dir.

    // If we switch to env.DATA_DIR/temp, we should probably follow the same pattern:
    // Create a subdir in TEMP_PATH? Or just a file?
    // If we just create a file in TEMP_PATH, cleanup is just deleting the file.
    // The previous logic returned { path, cleanup } where cleanup recursively deleted the dir.

    // Let's create a file directly in TEMP_PATH to make it servable via /temp/:filename
    // If we create a subdir, /temp/:filename won't find it (unless we support /temp/:subdir/:filename).
    // The API `tempFile.ts` only supports `/temp/:filename`.
    // So the previous implementation of `temp.ts` (nested dir) was incompatible with `tempFile.ts` (flat dir) anyway!
    // So they were definitely disconnected.

    // I will change logic to create a flat file in TEMP_PATH.

    return {
        path: filePath,
        cleanup: async () => {
            try {
                await rm(filePath, { force: true });
            } catch { }
        }
    };
}

export const file = createTempFile;
