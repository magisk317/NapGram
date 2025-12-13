import { FastifyInstance } from 'fastify';
import db from '../domain/models/db';
import processNestedForward from '../shared/utils/processNestedForward';
import { TTLCache } from '../shared/utils/cache';
import { ErrorResponses } from '../shared/utils/fastify';
import { authMiddleware } from '../infrastructure/auth/authMiddleware';

const forwardCache = new TTLCache<string, any>(60000); // 1 minute TTL

export default async function (fastify: FastifyInstance) {
  // 管理端 - 消息列表
  fastify.get('/api/admin/messages', {
    preHandler: authMiddleware
  }, async (request) => {
    const { page = 1, limit = 20, search, from, to, sortBy = 'id', sortDir = 'desc' } = request.query as any;
    const take = Math.min(1000, Math.max(parseInt(String(limit)) || 20, 1));
    const skip = (Math.max(parseInt(String(page)) || 1, 1) - 1) * take;

    const where: any = {};
    if (search) {
      where.OR = [
        { brief: { contains: search } },
        { tgMessageText: { contains: search } },
      ];
    }
    const startTime = from ? parseInt(String(from)) : undefined;
    const endTime = to ? parseInt(String(to)) : undefined;
    if (startTime || endTime) {
      where.time = {};
      if (startTime) where.time.gte = startTime;
      if (endTime) where.time.lte = endTime;
    }

    const sortableFields: Record<string, boolean> = { id: true, time: true };
    const orderField = sortableFields[sortBy] ? sortBy : 'id';
    const orderDirection = sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      db.message.findMany({
        where,
        skip,
        take,
        orderBy: { [orderField]: orderDirection },
        select: {
          id: true,
          qqRoomId: true,
          tgChatId: true,
          time: true,
          brief: true,
          tgMessageText: true,
        }
      }),
      db.message.count({ where })
    ]);

    return {
      success: true,
      items: items.map(it => ({
        ...it,
        qqRoomId: it.qqRoomId.toString(),
        tgChatId: it.tgChatId.toString(),
      })),
      total,
      page,
      limit: take
    };
  });

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
