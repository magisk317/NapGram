import { Elysia, t } from 'elysia';
import db from '../../../domain/models/db';
import { Pair } from '../../../domain/models/Pair';
import processNestedForward from '../../../shared/utils/processNestedForward';

const forwardCache = new Map<string, any>();

let app = new Elysia()
  .post('/api/messages/legacy/get', async ({ body }) => {
    // @ts-ignore 
    return getForwardMessage(body.uuid);
  }, {
    body: t.Object({
      // 不许注入
      uuid: t.String({ format: 'uuid' }),
    }),
  })
  .get('/api/messages/merged/:uuid', async ({ params }) => {
    return getForwardMessage(params.uuid);
  });

async function getForwardMessage(uuid: string) {
  if (!forwardCache.has(uuid)) {
    const data = await db.forwardMultiple.findFirst({
      where: { id: uuid },
    });

    if (!data) throw new Error('Message not found');

    // Find the instance and client
    // @ts-ignore
    const instances = (await import('../../../domain/models/Instance')).default.instances;
    let client: any;

    // Try to find the correct instance/client
    // Since we don't store instanceId in ForwardMultiple, we have to look up the pair
    const pairData = await db.forwardPair.findUnique({
      where: { id: data.fromPairId },
    });

    if (pairData) {
      const instance = instances.find((i: any) => i.id === pairData.instanceId);
      if (instance && instance.qqClient) {
        client = instance.qqClient;
      }
    }

    if (!client) {
      // Fallback: use the first available client if specific one not found
      // This is risky but better than crashing
      const instance = instances.find((i: any) => i.qqClient);
      client = instance?.qqClient;
    }

    if (!client) {
      throw new Error('No QQ client available');
    }

    const messages = await client.getForwardMsg(data.resId, data.fileName);
    // NapCat doesn't need refreshImageRKey
    await processNestedForward(messages, data.fromPairId);
    forwardCache.set(uuid, messages);

    setTimeout(() => {
      forwardCache.delete(uuid);
    }, 1000 * 60);
  }
  return forwardCache.get(uuid);
}

export default app;