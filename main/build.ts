import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import packageJson from './package.json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

import fs from 'node:fs'
import path from 'node:path'

const packagesDir = path.resolve(__dirname, '../packages')
const packages = fs.readdirSync(packagesDir).filter(f => fs.statSync(path.join(packagesDir, f)).isDirectory())

const workspaceAliases: Record<string, string> = {}
packages.forEach(pkg => {
  const srcIndex = path.join(packagesDir, pkg, 'src/index.ts')
  const pkgJsonPath = path.join(packagesDir, pkg, 'package.json')

  if (fs.existsSync(srcIndex) && fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      workspaceAliases[pkgJson.name] = srcIndex
    } catch (e) {
      console.warn(`Failed to parse package.json for ${pkg}`, e)
    }
  }
})

console.log('Resolved workspace aliases:', Object.keys(workspaceAliases).length)

esbuild.buildSync({
  bundle: true,
  entryPoints: ['src/index.ts'],
  outdir: 'build',
  sourcemap: true,
  platform: 'node',
  format: 'esm',
  banner,
  alias: workspaceAliases,
  external: Object.keys(packageJson.dependencies).filter(dep => !workspaceAliases[dep]),
})
