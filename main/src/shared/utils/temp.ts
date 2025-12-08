import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

export async function createTempFile(options?: { postfix?: string, prefix?: string }) {
    const prefix = options?.prefix || 'napgram-';
    const tempDir = await mkdtemp(join(tmpdir(), prefix));
    const postfix = options?.postfix || '.tmp';
    const filename = `temp-${randomBytes(6).toString('hex')}${postfix}`;
    const filePath = join(tempDir, filename);

    const cleanup = async () => {
        try {
            await rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // ignore cleanup errors
        }
    };

    return {
        path: filePath,
        cleanup
    };
}

export const file = createTempFile;
