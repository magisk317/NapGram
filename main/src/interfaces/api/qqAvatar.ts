import { Elysia } from 'elysia';

import { getLogger } from '../../shared/logger';

const logger = getLogger('QQAvatar');

export default new Elysia()
    .get('/qqAvatar/:userId', ({ params, set }) => fetchAvatar(params.userId, set))
    .get('/api/avatar/qq/:userId', ({ params, set }) => fetchAvatar(params.userId, set));

async function fetchAvatar(userId: string, set: any) {
    try {
        const url = `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=0`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType) {
            set.headers['content-type'] = contentType;
        }
        set.headers['cache-control'] = 'public, max-age=86400'; // Cache for 1 day

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        logger.error(`Failed to fetch avatar for ${userId}:`, e);
        set.status = 404;
        return 'Avatar not found';
    }
}
