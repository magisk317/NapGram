import { configureQQClient } from '@napgram/qq-client'
import { messageConverter } from '../../../domain/message/converter'
import { getLogger } from '../../../shared/logger'

configureQQClient({
  messageConverter,
  loggerFactory: getLogger,
})

export * from '@napgram/qq-client'
