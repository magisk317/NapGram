import esbuild from 'esbuild'
import packageJson from './package.json'

const banner = {
  js: `
    import { createRequire as _createRequire } from 'module';
    import { fileURLToPath as _fileURLToPath } from 'url';
    import { dirname as _dirname } from 'path';
    const require = _createRequire(import.meta.url);
    const __filename = _fileURLToPath(import.meta.url);
    const __dirname = _dirname(__filename);
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
  external: Object.keys(packageJson.dependencies ?? {}),
})
