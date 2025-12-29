import { configureTelegramClient } from '@napgram/telegram-client'
import env from '../../../domain/models/env'
import TelegramSession from '../../../domain/models/TelegramSession'
import { getLogger } from '../../../shared/logger'
import { TEMP_PATH } from '../../../shared/utils/temp'

configureTelegramClient({
  env,
  sessionFactory: (sessionId?: number) => new TelegramSession(sessionId),
  loggerFactory: getLogger,
  tempPath: TEMP_PATH,
})

export { default } from '@napgram/telegram-client'
export * from '@napgram/telegram-client'
