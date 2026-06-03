import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const TEST_COMPOSE_PROJECT = 'pump-test'
const TEST_COMPOSE_FILE = 'docker-compose.test.yml'
const TEST_POSTGRES_CONTAINER = 'pump-test-postgres'
const TEST_POSTGRES_DB = 'pump_test'
const TEST_REDIS_CONTAINER = 'pump-test-redis'
const args = new Set(process.argv.slice(2))

// Clean up dist/ if present to prevent bun test from running compiled tests
const distPath = path.resolve(process.cwd(), 'dist')
if (fs.existsSync(distPath)) {
  console.log('🧹 Cleaning up dist/ directory to avoid test execution conflicts...')
  fs.rmSync(distPath, { recursive: true, force: true })
}

// 1. Check if Docker CLI is installed
try {
  execSync('docker --version', { stdio: 'ignore' })
} catch {
  console.error('❌ Error: Docker is not installed or not in your PATH. Please install Docker before running tests.')
  process.exit(1)
}

// 2. Check if Docker daemon is running
try {
  execSync('docker info', { stdio: 'ignore' })
} catch {
  console.error('❌ Error: Docker daemon is not running. Please start Docker before running tests.')
  process.exit(1)
}

console.log('🐳 Docker is available and running.')

function teardownTestDocker() {
  console.log('🧹 Cleaning up Pump test Docker resources...')
  try {
    execSync(`docker compose -p ${TEST_COMPOSE_PROJECT} -f ${TEST_COMPOSE_FILE} down -v --remove-orphans`, { stdio: 'inherit' })
    console.log('✅ Pump test Docker resources removed.')
  } catch (err) {
    console.error('❌ Failed to clean up Pump test Docker resources:', err)
    return false
  }

  return true
}

if (args.has('--reset')) {
  console.log('🧹 Resetting Pump test Docker resources...')
  process.exit(teardownTestDocker() ? 0 : 1)
}

// Load .env.test environment variables
const envTestPath = path.resolve(process.cwd(), '.env.test')
const envTestVars: Record<string, string> = {}
if (fs.existsSync(envTestPath)) {
  const content = fs.readFileSync(envTestPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      envTestVars[key] = val
    }
  }
}

// 3. Spin up the containers using docker-compose.test.yml
console.log('⏳ Spinning up test containers...')
try {
  execSync(`docker compose -p ${TEST_COMPOSE_PROJECT} -f ${TEST_COMPOSE_FILE} up -d`, { stdio: 'inherit' })
} catch (err) {
  console.error('❌ Failed to start docker-compose containers:', err)
  process.exit(1)
}

// 4. Wait for services to be ready
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForCommand(command: string, label: string, timeoutMs = 30000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      execSync(command, { stdio: 'ignore' })
      return
    }
    catch {
      await sleep(500)
    }
  }

  throw new Error(`${label} did not become ready within ${timeoutMs}ms`)
}

async function waitForServices() {
  console.log('⏳ Waiting for Pump test Postgres and Redis...')
  await Promise.all([
    waitForCommand(
      `docker exec ${TEST_POSTGRES_CONTAINER} pg_isready -U postgres -d ${TEST_POSTGRES_DB}`,
      'Pump test Postgres',
    ),
    waitForCommand(
      `docker exec ${TEST_REDIS_CONTAINER} redis-cli ping`,
      'Pump test Redis',
    ),
  ])
  console.log('✅ Pump test services are ready.')
}

function syncTestSchema() {
  console.log('⏳ Syncing database schema with Prisma...')
  execSync('bunx prisma db push --accept-data-loss', {
    env: { ...process.env, ...envTestVars },
    stdio: 'inherit',
  })
  console.log('✅ Schema synced.')
}

function runTests() {
  console.log('🚀 Running tests...')

  return new Promise<number>((resolve) => {
    const testProcess = spawn('bun', ['test', 'test/'], {
      env: { ...process.env, ...envTestVars, NODE_ENV: 'test' },
      stdio: 'inherit',
    })

    testProcess.on('close', code => resolve(code ?? 0))
  })
}

async function main() {
  let exitCode = 0

  try {
    await waitForServices()
    syncTestSchema()
    exitCode = await runTests()
  } catch (err) {
    console.error('❌ Test runner failed:', err)
    exitCode = 1
  } finally {
    const cleanedUp = teardownTestDocker()
    if (!cleanedUp && exitCode === 0) {
      exitCode = 1
    }
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error('❌ Unexpected error in test runner:', err)
  process.exit(1)
})
