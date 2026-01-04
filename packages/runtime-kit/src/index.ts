/**
 * Core runtime kit exports.
 * This file is kept minimal to avoid pulling in the whole server implementation
 * during builds of client packages.
 */

// Essential kit exports
export { env, getLogger, db, temp, schema, eq, and, or, gte, lte, count, sql, desc } from '@napgram/infra-kit'

// New Runtime Abstraction
export * from './runtime-types'
export * from './config-store'
export * from './runtime-holder'
export { InstanceRegistry } from './runtime-holder'
export { PermissionChecker } from './permission-checker'
export { Instance } from './legacy'

// Re-exports of key store utilities that are safe to use
// (We might want to move these fully to runtime-kit later)

export { ApiResponse } from '@napgram/infra-kit'
export { convert } from '@napgram/media-kit'
export { convert as default } from '@napgram/media-kit'

// Safe Utilities
import { hashing, DurationParser } from '@napgram/infra-kit'
export const { md5Hex } = hashing
export { DurationParser }
export { hashing as hashingUtils } from '@napgram/infra-kit'
