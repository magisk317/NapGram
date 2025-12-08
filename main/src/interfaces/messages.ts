import { FastifyInstance } from 'fastify';
import db from '../domain/models/db';
import processNestedForward from '../shared/utils/processNestedForward';
import { TTLCache } from '../shared/utils/cache';
import { ErrorResponses } from '../shared/utils/fastify';

const forwardCache = new TTLCache<string, any>(60000); // 1 minute TTL

export default async function (fastify: FastifyInstance) {
  const getMessageSchema = {
    params: {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' }
      },
      required: ['uuid']
    }
  };

  fastify.get('/api/messages/:uuid', {
    schema: getMessageSchema
  }, async (request: any, reply: any) => {
    const { uuid } = request.params;
    const result = await tryGetForwardMultiple(uuid);
    if (!result) {
      return ErrorResponses.notFound(reply);
    }
    return result;
  });

  fastify.get('/messages/:uuid', {
    schema: getMessageSchema
  }, async (request: any, reply: any) => {
    const { uuid } = request.params;
    const result = await tryGetForwardMultiple(uuid);
    if (!result) {
      return ErrorResponses.notFound(reply);
    }
    return result;
  });

  async function tryGetForwardMultiple(uuid: string) {
    const cached = forwardCache.get(uuid);
    if (cached) {
      return cached;
    }

    const data = await db.forwardMultiple.findFirst({
      where: { id: uuid },
    });

    if (!data) return null;

    const instances = (await import('../domain/models/Instance')).default.instances;
    let client: any;

    // Try to find the correct instance/client
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
      const instance = instances.find((i: any) => i.qqClient);
      client = instance?.qqClient;
    }

    if (!client) {
      throw new Error('No QQ client available');
    }

    const messages = await client.getForwardMsg(data.resId, data.fileName);
    await processNestedForward(messages, data.fromPairId);

    forwardCache.set(uuid, messages);

    return messages;
  }
}