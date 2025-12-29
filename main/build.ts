import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import packageJson from './package.json'

const banner = {
  js: `
    import { createRequire } from 'module';
    import { fileURLToPath } from 'url';
    import { dirname } from 'path';
    const require = createRequire(import.meta.url);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
  `,
}

esbuild.buildSync({
  bundle: true,
  entryPoints: ['src/index.ts'],
  outdir: 'build',
  sourcemap: true,
  platform: 'node',
  format: 'esm',
  banner,
  alias: {
    '@napgram/feature-kit': fileURLToPath(new URL('../packages/feature-kit/src/index.ts', import.meta.url)),
    '@napgram/gateway-kit': fileURLToPath(new URL('../packages/gateway-kit/src/index.ts', import.meta.url)),
    '@napgram/infra-kit': fileURLToPath(new URL('../packages/infra-kit/src/index.ts', import.meta.url)),
    '@napgram/auth-kit': fileURLToPath(new URL('../packages/auth-kit/src/index.ts', import.meta.url)),
    '@napgram/media-kit': fileURLToPath(new URL('../packages/media-kit/src/index.ts', import.meta.url)),
    '@napgram/message-kit': fileURLToPath(new URL('../packages/message-kit/src/index.ts', import.meta.url)),
    '@napgram/marketplace-kit': fileURLToPath(new URL('../packages/marketplace-kit/src/index.ts', import.meta.url)),
    '@napgram/request-kit': fileURLToPath(new URL('../packages/request-kit/src/index.ts', import.meta.url)),
    '@napgram/runtime-kit': fileURLToPath(new URL('../packages/runtime-kit/src/index.ts', import.meta.url)),
    '@napgram/web-interfaces': fileURLToPath(new URL('../packages/web-interfaces/src/index.ts', import.meta.url)),
  },
  external: Object.keys(packageJson.dependencies),
})
