/**
 * GatewayRuntime
 *
 * Ensures the Gateway server is started only once, and provides a registry for
 * per-instance ActionExecutors and a shared EventPublisher.
 */

import type { IQQClient } from '@napgram/qq-client'
import type Telegram from '@napgram/telegram-client'
import type { GatewayPairsProvider } from '../types'
import { getLogger } from '../logger'
import { ActionExecutor } from '../adapters/ActionExecutor'
import { EventPublisher } from '../adapters/EventPublisher'
import { GatewayServer } from './GatewayServer'

const logger = getLogger('GatewayRuntime')

export class GatewayRuntime {
  private static server?: GatewayServer
  private static publisher?: EventPublisher
  private static executors = new Map<number, ActionExecutor>()
  private static pairsProvider = new Map<number, () => any[]>()

  static ensureStarted(port = 8765) {
    if (!this.server) {
      this.server = new GatewayServer(port, {
        resolveExecutor: instanceId => this.executors.get(instanceId),
        resolvePairs: instanceId => (this.pairsProvider.get(instanceId)?.() as any[]) || [],
      })
      this.publisher = new EventPublisher(this.server)
      logger.info(`Gateway runtime started (port=${port})`)
    }
    return { server: this.server, publisher: this.publisher! }
  }

  static registerInstance(instanceId: number, qqClient: IQQClient, tgBot: Telegram, forwardPairs?: GatewayPairsProvider) {
    const { server, publisher } = this.ensureStarted()
    const executor = new ActionExecutor(qqClient, tgBot)
    this.executors.set(instanceId, executor)
    if (forwardPairs)
      this.pairsProvider.set(instanceId, () => forwardPairs.getAll())
    logger.info({ instanceId }, 'Gateway instance registered')
    return { server, publisher, executor }
  }

  static unregisterInstance(instanceId: number) {
    this.executors.delete(instanceId)
    this.pairsProvider.delete(instanceId)
    logger.info({ instanceId }, 'Gateway instance unregistered')
  }
}
