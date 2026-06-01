#!/usr/bin/env node
/**
 * check-tests.js
 * Pre-commit script: ensures every staged source module or service has a corresponding test file.
 * Blocks the commit (exit 1) if a test file is missing.
 *
 * Convention:
 *   src/modules/health/health.routes.ts  →  test/api/health.ts
 *   src/services/cache.service.ts        →  test/services/cache.ts
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// Get all staged .ts files
const raw = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' }).trim()
const staged = raw.split('\n').filter(Boolean)

// Filter for modules and services
const filesToTest = staged.filter((f) => {
  return (
    (f.startsWith('src/modules/') || f.startsWith('src/services/')) &&
    !f.includes('node_modules') &&
    f.endsWith('.ts') &&
    !f.endsWith('.test.ts') &&
    !f.endsWith('.spec.ts')
  )
})

if (filesToTest.length === 0) {
  process.exit(0)
}

let hasError = false

for (const file of filesToTest) {
  let testFile = ''
  let displayPath = ''

  if (file.startsWith('src/modules/')) {
    const parts = file.split('/')
    const moduleName = parts[2]
    if (!moduleName) continue
    const candidates = [
      path.join(ROOT, 'test', 'api', `${moduleName}.test.ts`),
      path.join(ROOT, 'test', 'api', `${moduleName}.ts`),
    ]
    const matched = candidates.find(f => existsSync(f))
    testFile = matched || candidates[0]
    displayPath = matched ? path.relative(ROOT, matched) : `test/api/${moduleName}.test.ts`
  } else if (file.startsWith('src/services/')) {
    const fileName = path.basename(file, '.ts')
    const serviceName = fileName.replace('.service', '')
    const candidates = [
      path.join(ROOT, 'test', 'services', `${serviceName}.test.ts`),
      path.join(ROOT, 'test', 'services', `${serviceName}.ts`),
    ]
    const matched = candidates.find(f => existsSync(f))
    testFile = matched || candidates[0]
    displayPath = matched ? path.relative(ROOT, matched) : `test/services/${serviceName}.test.ts`
  }

  if (testFile && !existsSync(testFile)) {
    console.error(`\n❌ Missing test file: ${displayPath}`)
    console.error(`   Required by: ${file}\n`)
    hasError = true
  }
}

if (hasError) {
  console.error('⛔  Commit blocked: write tests for all new modules/services before committing.\n')
  process.exit(1)
}

console.log('✅  All staged modules/services have corresponding test files.\n')
process.exit(0)
