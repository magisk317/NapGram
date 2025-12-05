import { Elysia } from 'elysia';
import path from 'path';
import fs from 'fs';
import env from '../../domain/models/env';

const tempDir = path.join(env.DATA_DIR, 'temp');

if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

export default new Elysia()
    .get('/temp/:filename', ({ params: { filename }, set }) => {
        const filePath = path.join(tempDir, filename);
        // Prevent directory traversal
        if (!filePath.startsWith(tempDir)) {
            set.status = 403;
            return 'Forbidden';
        }
        if (fs.existsSync(filePath)) {
            const file = fs.readFileSync(filePath);
            const ext = path.extname(filename).toLowerCase();
            const mimeTypes: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.ogg': 'audio/ogg',
                '.mp3': 'audio/mpeg',
            };
            return new Response(file as any, {
                headers: {
                    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                },
            });
        }
        set.status = 404;
        return 'Not Found';
    });
