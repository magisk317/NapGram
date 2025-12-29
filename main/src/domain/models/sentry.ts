import * as Sentry from '@sentry/node'
import { getLogger } from '../../shared/logger'
import env from './env'

const logger = getLogger('Sentry')
const DSN = 'https://fac3173e13d1869f2aa4e906fcbe5dcf@o4505899284955136.ingest.us.sentry.io/4505901103185920'
const ENVIRONMENT = 'napgram'
const enabled = env.ERROR_REPORTING
let initialized = false

export function initSentry() {
  if (!enabled || initialized)
    return

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: env.COMMIT,
    tracesSampleRate: 0,
  })

  Sentry.setTag('repo', env.REPO)
  Sentry.setTag('ref', env.REF)
  Sentry.setTag('commit', env.COMMIT)

  initialized = true
  logger.info('Sentry initialized')
}

export function captureException(error: unknown, extra?: Record<string, unknown>) {
  if (!enabled)
    return
  if (!initialized)
    initSentry()
  Sentry.captureException(error, { extra })
}

export function captureMessage(message: string, extra?: Record<string, unknown>) {
  if (!enabled)
    return
  if (!initialized)
    initSentry()
  Sentry.captureMessage(message, { extra })
}

export async function flush(timeoutMs = 2000) {
  if (!enabled || !initialized)
    return true
  return await Sentry.flush(timeoutMs)
}

export default {
  init: initSentry,
  captureException,
  captureMessage,
  flush,
}
