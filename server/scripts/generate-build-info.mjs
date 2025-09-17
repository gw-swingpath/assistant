import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

let gitSha = 'unknown'
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
} catch {}

const builtAt = new Date().toISOString()

const buildInfo = {
  name: pkg.name || 'assistant-server',
  version: pkg.version || '0.0.0',
  gitSha,
  builtAt,
}

writeFileSync(resolve(root, 'build-info.json'), JSON.stringify(buildInfo, null, 2))
console.log('Wrote build-info.json')


