export { configureInfraKit } from './deps'
export type { InfraLogger, LoggerFactory } from './deps'
import flags from './flags'
import qface from './qface'
export { default as ForwardMap } from './models/ForwardMap'
export type { ForwardPairRecord } from './models/ForwardMap'
export { Pair } from './models/Pair'

import { CacheManager, configCache, groupInfoCache, mediaCache, userInfoCache } from './CacheManager'
export type { CacheConfig } from './CacheManager'
import { MessageQueue } from './MessageQueue'
export type { MessageHandler, QueueConfig } from './MessageQueue'
import { performanceMonitor, PerformanceMonitor, startMonitoring } from './PerformanceMonitor'
export type { PerformanceMetrics, PerformanceStats } from './PerformanceMonitor'
import env from './env'
import getLogger, { setConsoleLogLevel } from './logger'
import type { AppLogger } from './logger'
import db from './db'
import { drizzleDb, schema, eq, and, or, lt, lte, gt, gte, like, inArray, isNull, isNotNull, desc, sql, count } from '@napgram/database'
import * as temp from './temp'
import { DurationParser } from './utils/duration-parser'
import * as hashing from './utils/hashing'
import random from './utils/random'
import { getMimeType } from './utils/mime'
import { ApiResponse } from './utils/api-response'
import * as urls from './utils/urls'
import * as flagControl from './utils/flagControl'
import sentry from './sentry'
import * as arrays from './utils/arrays'
import * as cache from './utils/cache'
import * as date from './utils/date'
import * as pastebin from './utils/pastebin'
import * as highLevel from './utils/highLevel'

// Individual named exports from modules
export { TTLCache } from './utils/cache'
export { formatDate } from './utils/date'
export { registerDualRoute, ErrorResponses } from './utils/fastify'
export const { TEMP_PATH } = temp

// Named exports
export {
  CacheManager, configCache, groupInfoCache, mediaCache, userInfoCache,
  MessageQueue,
  performanceMonitor, PerformanceMonitor, startMonitoring,
  env,
  getLogger, setConsoleLogLevel,
  db,
  drizzleDb,
  schema,
  eq,
  and,
  or,
  lt,
  lte,
  gt,
  desc,
  gte,
  like,
  inArray,
  isNull,
  isNotNull,
  sql,
  count,
  temp,
  qface,
  DurationParser,
  hashing,
  random,
  getMimeType,
  flags,
  ApiResponse,
  urls,
  flagControl,
  sentry,
  arrays,
  cache,
  date,
  pastebin,
  highLevel
}
export type { AppLogger }

// Default export for compatibility with tests
const kit = {
  env,
  getLogger,
  db,
  drizzleDb,
  temp,
  performanceMonitor,
  CacheManager,
  MessageQueue,
  qface,
}

Object.assign(kit, env)

export default kit
