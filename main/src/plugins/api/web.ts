/**
 * NapGram Web API (route registration)
 */

import type { WebAPI } from '../core/interfaces'
import { getLogger } from '../../shared/logger'

const logger = getLogger('WebAPI')

type WebRouteRegistrar = (register: (app: any) => void, pluginId?: string) => void

export class WebAPIImpl implements WebAPI {
  constructor(private readonly registrar?: WebRouteRegistrar) {}

  registerRoutes(register: (app: any) => void, pluginId?: string): void {
    if (!this.registrar) {
      logger.warn('WebAPI not configured (route registration unavailable)')
      return
    }
    this.registrar(register, pluginId)
  }
}

export function createWebAPI(registrar?: WebRouteRegistrar): WebAPI {
  return new WebAPIImpl(registrar)
}
