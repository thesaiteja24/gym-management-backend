import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

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

const pgPort = 5433
const redisPort = 6380

// 3. Spin up the containers using docker-compose.test.yml
console.log('⏳ Spinning up test containers...')
try {
  execSync('docker compose -f docker-compose.test.yml up -d', { stdio: 'inherit' })
} catch (err) {
  console.error('❌ Failed to start docker-compose containers:', err)
  process.exit(1)
}

// 4. Wait for services to be ready
function checkPort(port: number, host = '127.0.0.1', timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const onError = () => {
      socket.destroy()
      resolve(false)
    }
    socket.setTimeout(timeout)
    socket.once('error', onError)
    socket.once('timeout', onError)
    socket.connect(port, host, () => {
      socket.end()
      resolve(true)
    })
  })
}

async function waitForServices() {
  const maxAttempts = 30
  console.log('⏳ Waiting for Postgres (5433) and Redis (6380) to be ready...')
  for (let i = 1; i <= maxAttempts; i++) {
    const pgReady = await checkPort(pgPort)
    const redisReady = await checkPort(redisPort)
    if (pgReady && redisReady) {
      console.log('✅ Postgres and Redis are ready to accept connections.')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.error('❌ Timeout waiting for database or redis services to be ready.')
  process.exit(1)
}

async function main() {
  await waitForServices()

  // 5. Run prisma db push to ensure schema is synced in the test db
  console.log('⏳ Syncing database schema with Prisma...')
  try {
    execSync('bunx prisma db push --accept-data-loss', {
      env: { ...process.env, ...envTestVars },
      stdio: 'inherit',
    })
    console.log('✅ Schema synced.')
  } catch (err) {
    console.error('❌ Failed to push prisma schema:', err)
    process.exit(1)
  }

  // 6. Run the tests
  console.log('🚀 Running tests...')
  const testProcess = spawn('bun', ['test', 'test/'], {
    env: { ...process.env, ...envTestVars, NODE_ENV: 'test' },
    stdio: 'inherit',
  })

  testProcess.on('close', (code) => {
    const isProductionOrCI = process.env.NODE_ENV === 'production' || process.env.CI === 'true'
    if (isProductionOrCI) {
      console.log('🧹 Production/CI environment detected. Cleaning up and tearing down containers...')
      try {
        execSync('docker compose -f docker-compose.test.yml down -v', { stdio: 'inherit' })
        console.log('✅ Containers destroyed.')
      } catch (err) {
        console.error('❌ Failed to teardown containers:', err)
      }
    } else {
      console.log('💡 Development mode: Keeping containers running for the next test run.')
    }
    process.exit(code ?? 0)
  })
}

main().catch((err) => {
  console.error('❌ Unexpected error in test runner:', err)
  process.exit(1)
})

