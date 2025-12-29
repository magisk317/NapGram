import type { FastifyInstance } from 'fastify'
import type { TelegramClient } from '@napgram/runtime-kit'
import fs from 'node:fs'
import {
  convert,
  ErrorResponses,
  getLogger,
  Instance,
  registerDualRoute,
} from '@napgram/runtime-kit'

const log = getLogger('telegramAvatar')

async function getUserAvatarPath(tgBot: TelegramClient, userId: string) {
  try {
    const buffer = await tgBot.downloadProfilePhoto(Number(userId))
    if (!buffer)
      return ''
    return await convert.cachedBuffer(`avatar_${userId}.jpg`, async () => buffer)
  }
  catch (e) {
    log.warn(`Failed to download avatar for ${userId}:`, e)
    return ''
  }
}

export default async function (fastify: FastifyInstance) {
  const handler = async (request: any, reply: any) => {
    const { instanceId, userId } = request.params
    log.debug('请求头像', userId)

    const instance = Instance.instances.find(it => it.id.toString() === instanceId)
    if (!instance) {
      return ErrorResponses.notFound(reply, 'Instance not found')
    }

    const avatar = await getUserAvatarPath(instance.tgBot, userId)

    if (!avatar) {
      return ErrorResponses.notFound(reply)
    }

    reply.header('content-type', 'image/jpeg')
    return fs.createReadStream(avatar)
  }

  registerDualRoute(
    fastify,
    '/telegramAvatar/:instanceId/:userId',
    '/api/avatar/telegram/:instanceId/:userId',
    handler,
  )
}
