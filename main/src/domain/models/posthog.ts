import os from 'node:os'
import { getLogger } from '../../shared/logger'
import env from './env'

const logger = getLogger('PostHog')
const API_KEY = 'phc_LmyAmIzRPk8Eoy5kMCFhwKVckY11vQS3KbGba2q4Hhm'
const HOST = 'https://eu.i.posthog.com'
const hostname = os.hostname()

export default {
  capture(event: string, properties: Record<string, any>) {
    if (env.POSTHOG_OPTOUT)
      return

    if (typeof properties?.error === 'object' && properties.error.stack && JSON.stringify(properties.error) === '{}') {
      properties.error = properties.error.stack
    }
    properties.repo = env.REPO
    properties.ref = env.REF
    properties.commit = env.COMMIT

    // Fire and forget
    fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: API_KEY,
        event,
        properties: {
          ...properties,
          distinct_id: hostname,
          $lib: 'napgram-lite',
        },
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => {
      logger.debug('Failed to send telemetry', err)
    })
  },
}
