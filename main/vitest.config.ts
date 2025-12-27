import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const mainDir = fileURLToPath(new URL('.', import.meta.url))
const rootDir = path.resolve(mainDir, '..')
const packagesDir = path.resolve(rootDir, 'packages')
const packageSrc = (name: string) => path.resolve(packagesDir, name, 'src', 'index.ts')

export default defineConfig({
  resolve: {
    alias: {
      '@napgram/feature-kit': packageSrc('feature-kit'),
      '@napgram/gateway-kit': packageSrc('gateway-kit'),
      '@napgram/infra-kit': packageSrc('infra-kit'),
      '@napgram/auth-kit': packageSrc('auth-kit'),
      '@napgram/media-kit': packageSrc('media-kit'),
      '@napgram/message-kit': packageSrc('message-kit'),
      '@napgram/marketplace-kit': packageSrc('marketplace-kit'),
      '@napgram/request-kit': packageSrc('request-kit'),
      '@napgram/runtime-kit': packageSrc('runtime-kit'),
      '@napgram/qq-client': packageSrc('qq-client'),
      '@napgram/telegram-client': packageSrc('telegram-client'),
      '@napgram/web-interfaces': packageSrc('web-interfaces'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'build/**',
        'dist/**',
        '**/*.config.*',
        '**/__tests__/**',
        '**/prisma/**',
      ],
    },
  },
})
