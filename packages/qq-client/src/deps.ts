import type { UnifiedMessage } from './message'

export interface LoggerLike {
  debug(message: any, ...args: any[]): void
  info(message: any, ...args: any[]): void
  warn(message: any, ...args: any[]): void
  error(message: any, ...args: any[]): void
  trace?(message: any, ...args: any[]): void
}

export type LoggerFactory = (name: string) => LoggerLike

export interface QQMessageConverter {
  fromNapCat: (napCatMessage: any) => UnifiedMessage
  toNapCat: (message: UnifiedMessage) => Promise<any> | any
}

export interface QQClientDependencies {
  messageConverter: QQMessageConverter
  loggerFactory?: LoggerFactory
}

let currentDependencies: QQClientDependencies | null = null

export function configureQQClient(deps: QQClientDependencies): void {
  currentDependencies = deps
}

export function getQQClientDependencies(): QQClientDependencies {
  if (!currentDependencies) {
    throw new Error('QQ client dependencies not configured')
  }
  return currentDependencies
}

export function resolveLoggerFactory(factory?: LoggerFactory): LoggerFactory {
  if (factory)
    return factory

  return (name: string) => {
    const prefix = `[${name}]`
    return {
      debug: (message: string, ...args: any[]) => console.debug(prefix, message, ...args),
      info: (message: string, ...args: any[]) => console.info(prefix, message, ...args),
      warn: (message: string, ...args: any[]) => console.warn(prefix, message, ...args),
      error: (message: string, ...args: any[]) => console.error(prefix, message, ...args),
      trace: (message: string, ...args: any[]) => console.trace(prefix, message, ...args),
    }
  }
}
