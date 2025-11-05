/**
 * Electron 主进程构建脚本
 */

import { build } from 'esbuild'
import { existsSync, mkdirSync } from 'fs'

const outdir = 'dist-electron'

if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true })
}

// 构建主进程
build({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['electron', 'fs', 'path'],
  outfile: `${outdir}/main.js`,
  format: 'cjs',
  sourcemap: true
}).then(() => {
  console.log('✓ Main process built')
}).catch((err) => {
  console.error(err)
  process.exit(1)
})

// 构建 preload
build({
  entryPoints: ['electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['electron'],
  outfile: `${outdir}/preload.js`,
  format: 'cjs'
}).then(() => {
  console.log('✓ Preload script built')
}).catch(() => process.exit(1))
