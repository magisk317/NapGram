import { FastifyInstance } from 'fastify';
import Instance from '../domain/models/Instance';
import convert from '../shared/utils/convert';
import Telegram from '../infrastructure/clients/telegram/client';
import { getLogger } from '../shared/logger';
import { registerDualRoute, ErrorResponses } from '../shared/utils/fastify';
import fs from 'fs';

const log = getLogger('telegramAvatar');

const userAvatarFileIdCache = new Map<string, string>();

const getUserAvatarPath = async (tgBot: Telegram, userId: string) => {
  try {
    const buffer = await tgBot.downloadProfilePhoto(Number(userId));
    if (!buffer) return '';
    return await convert.cachedBuffer(`avatar_${userId}.jpg`, async () => buffer);
  } catch (e) {
    log.warn(`Failed to download avatar for ${userId}:`, e);
    return '';
  }
};

export default async function (fastify: FastifyInstance) {
  const handler = async (request: any, reply: any) => {
    const { instanceId, userId } = request.params;
    log.debug('请求头像', userId);

    const instance = Instance.instances.find(it => it.id.toString() === instanceId);
    if (!instance) {
      return ErrorResponses.notFound(reply, 'Instance not found');
    }

    const avatar = await getUserAvatarPath(instance.tgBot, userId);

    if (!avatar) {
      return ErrorResponses.notFound(reply);
    }

    reply.header('content-type', 'image/jpeg');
    return fs.createReadStream(avatar);
  };

  registerDualRoute(
    fastify,
    '/telegramAvatar/:instanceId/:userId',
    '/api/avatar/telegram/:instanceId/:userId',
    handler
  );
}
