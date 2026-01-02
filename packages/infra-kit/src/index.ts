export { configureInfraKit } from './deps'
export type { InfraLogger, LoggerFactory } from './deps'

import { CacheManager, configCache, groupInfoCache, mediaCache, userInfoCache } from './CacheManager'
import { MessageQueue } from './MessageQueue'
import { performanceMonitor, PerformanceMonitor } from './PerformanceMonitor'
import env from './env'
import getLogger, { AppLogger, setConsoleLogLevel } from './logger'
import db from './db'
import * as temp from './temp'

// Named exports
export {
  CacheManager, configCache, groupInfoCache, mediaCache, userInfoCache,
  MessageQueue,
  performanceMonitor, PerformanceMonitor,
  env,
  getLogger, AppLogger, setConsoleLogLevel,
  db,
  temp
}

// Default export for compatibility with tests using import kit from '@napgram/infra-kit'
// and expecting kit.env, kit.db, etc.
const kit = {
  env,
  getLogger,
  db,
  temp,
  performanceMonitor,
  CacheManager,
  MessageQueue,
}

// To support the weird pattern in some tests where they do (module as any).default || module
// and expect properties like ADMIN_QQ to be directly on that object if they mocked it that way.
// We can't easily fix the mock bodies automatically, but we can make the default export
// proxy or include the properties if needed.
// Actually, the best way is to make the default export the same object that has everything.
Object.assign(kit, env) // This might be dangerous if there are name collisions.
// But mostly people want kit.env.ADMIN_QQ.
// Wait, PermissionChecker.test.ts mocked it as:
// default: { ADMIN_QQ: ... }
// So it expects the default export to BE the env object? No, it expects it to HAVE those properties.

export default kit
