#!/usr/bin/env node
/**
 * setup.js
 * One-command project bootstrapper for fresh clones.
 * Run via: npm run setup
 */

import { execSync } from 'node:child_process'
const ROOT = process.cwd()

function run(cmd, label) {
  console.log(`\n⏳  ${label}...`)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT })
    console.log(`✅  ${label} done.`)
  }
  catch {
    console.error(`❌  ${label} failed.`)
    process.exit(1)
  }
}

// 1. Check for Bun Runtime or Node 22+ fallback
const isBun = typeof process.versions.bun !== 'undefined'
if (isBun) {
  console.log(`✅  Bun ${process.versions.bun} detected.`)
} else {
  const nodeVersion = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (nodeVersion < 22) {
    console.error(`❌  Bun or Node.js 22+ is required. You are running Node ${process.versions.node}.`)
    console.error('    Run: bun install -g bun')
    process.exit(1)
  }
  console.log(`✅  Node.js ${process.versions.node} detected.`)
}

// 2. Install dependencies
const installCmd = isBun ? 'bun install' : 'npm install'
run(installCmd, 'Installing dependencies')

// 3. Initialize Husky hooks
run(isBun ? 'bunx husky' : 'npx husky', 'Initializing Husky git hooks')

// 4. Create local environment files
run(isBun ? 'bun run env:sync' : 'npm run env:sync', 'Syncing local environment files')

// 5. Done
console.log('\n🚀  Setup complete! Run `npm run dev` to start the server.\n')
