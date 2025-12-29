export type InfraLogger = {
  trace: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type LoggerFactory = (name: string) => InfraLogger

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

export function configureInfraKit(options: { loggerFactory?: LoggerFactory } = {}) {
  if (options.loggerFactory) {
    loggerFactory = options.loggerFactory
  }
}

export function getInfraLogger(name: string): InfraLogger {
  return {
    trace: (...args) => loggerFactory(name).trace(...args),
    debug: (...args) => loggerFactory(name).debug(...args),
    info: (...args) => loggerFactory(name).info(...args),
    warn: (...args) => loggerFactory(name).warn(...args),
    error: (...args) => loggerFactory(name).error(...args),
  }
}
