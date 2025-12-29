export type GatewayLogger = {
  trace: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type LoggerFactory = (name: string) => GatewayLogger

const defaultLoggerFactory: LoggerFactory = (name) => {
  const prefix = `[${name}]`
  return {
    trace: (...args) => console.debug(prefix, ...args),
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  }
}

let loggerFactory: LoggerFactory = defaultLoggerFactory

export function configureGatewayKit(options: { loggerFactory?: LoggerFactory } = {}) {
  if (options.loggerFactory) {
    loggerFactory = options.loggerFactory
  }
}

export function getLogger(name: string): GatewayLogger {
  return loggerFactory(name)
}
