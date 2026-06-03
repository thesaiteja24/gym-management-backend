import { spawn } from 'node:child_process'
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const ROOT = process.cwd()
const DEV_COMPOSE_FILE = 'docker-compose.dev.yml'
const DEV_POSTGRES_CONTAINER = 'pump-dev-postgres'
const DEV_POSTGRES_DB = 'pump_dev'
const DEV_SHADOW_DB = 'pump_shadow'
const DEV_POSTGRES_PORT = 9001
const DEV_REDIS_PORT = 9002

const args = new Set(process.argv.slice(2))

function run(command: string, label: string, options: { allowFailure?: boolean } = {}) {
  console.log(`⏳ ${label}...`)
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit' })
    console.log(`✅ ${label} done.`)
    return true
  }
  catch {
    if (options.allowFailure) {
      console.log(`ℹ️  ${label} skipped or already clean.`)
      return false
    }

    console.error(`❌ ${label} failed.`)
    process.exit(1)
  }
}

function parseEnvFile(filePath: string) {
  const values: Record<string, string> = {}

  if (!fs.existsSync(filePath)) {
    return values
  }

  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index === -1) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }

  return values
}

function removePath(relativePath: string) {
  const target = path.join(ROOT, relativePath)
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
    console.log(`✅ Removed ${relativePath}`)
  }
}

function removeBuildCaches() {
  removePath('node_modules')
  removePath('dist')
  removePath('build')

  for (const fileName of fs.readdirSync(ROOT)) {
    if (fileName.endsWith('.tsbuildinfo')) {
      removePath(fileName)
    }
  }
}

function assertDockerRunning() {
  try {
    execSync('docker info', { stdio: 'ignore' })
  }
  catch {
    console.error('❌ Docker daemon is not running. Start Docker and retry.')
    process.exit(1)
  }
}

function resetDevDocker() {
  run(`docker compose -f ${DEV_COMPOSE_FILE} down -v --remove-orphans`, 'Removing Pump dev Docker resources', {
    allowFailure: true,
  })
}

function waitForPort(port: number, label: string, timeoutMs = 30000) {
  const startedAt = Date.now()

  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const socket = new net.Socket()

      const retry = () => {
        socket.destroy()
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`${label} did not become ready on port ${port}`))
          return
        }
        setTimeout(check, 500)
      }

      socket.setTimeout(1000)
      socket.once('error', retry)
      socket.once('timeout', retry)
      socket.connect(port, '127.0.0.1', () => {
        socket.end()
        resolve()
      })
    }

    check()
  })
}

async function waitForDevServices() {
  console.log('⏳ Waiting for Pump dev Postgres and Redis...')
  await Promise.all([
    waitForPort(DEV_POSTGRES_PORT, 'Pump dev Postgres'),
    waitForPort(DEV_REDIS_PORT, 'Pump dev Redis'),
  ])
  console.log('✅ Pump dev services are ready.')
}

function ensureDatabase(database: string) {
  run(
    `docker exec ${DEV_POSTGRES_CONTAINER} sh -c "createdb -U postgres ${database} 2>/dev/null || true"`,
    `Ensuring ${database} database exists`,
  )
}

function queryDevDatabase(sql: string) {
  return execFileSync('docker', [
    'exec',
    DEV_POSTGRES_CONTAINER,
    'psql',
    '-U',
    'postgres',
    '-d',
    DEV_POSTGRES_DB,
    '-tAc',
    sql,
  ], { cwd: ROOT, encoding: 'utf8' }).trim()
}

function isDevDatabaseEmpty() {
  const tableCount = queryDevDatabase(`
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';
  `)

  return Number(tableCount) === 0
}

function cloneProductionDatabaseIfNeeded() {
  if (!isDevDatabaseEmpty()) {
    console.log('✅ Dev database already has tables; skipping prod clone.')
    return
  }

  const productionEnv = parseEnvFile(path.join(ROOT, '.env.production'))
  const productionDatabaseUrl = productionEnv.MASTER_URL

  if (!productionDatabaseUrl) {
    console.log('ℹ️  .env.production MASTER_URL not found; skipping prod database clone.')
    return
  }

  console.log('⏳ Dev database is empty; cloning production database from Neon...')
  const dumpPath = path.join('/tmp', `pump-prod-clone-${Date.now()}.sql`)

  try {
    run(
      `docker run --rm postgres:17-alpine pg_dump --no-owner --no-privileges --clean --if-exists "${productionDatabaseUrl}" > "${dumpPath}"`,
      'Dumping production database',
    )
    run(
      `docker exec -i ${DEV_POSTGRES_CONTAINER} psql -U postgres -d ${DEV_POSTGRES_DB} < "${dumpPath}"`,
      'Restoring production dump into dev database',
    )
  }
  finally {
    if (fs.existsSync(dumpPath)) {
      fs.rmSync(dumpPath, { force: true })
    }
  }
}

function startDevServer() {
  console.log('🚀 Starting Pump API dev server on port 9000...')
  const env = {
    ...process.env,
    ...parseEnvFile(path.join(ROOT, '.env.development')),
    NODE_ENV: 'development',
  }

  const server = spawn('bun', ['--watch', 'src/server.ts'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  })

  server.on('close', code => process.exit(code ?? 0))
}

async function startDev() {
  run('bun run scripts/env-sync.ts', 'Syncing local env files')
  assertDockerRunning()
  run(`docker compose -f ${DEV_COMPOSE_FILE} up -d`, 'Starting Pump dev Docker services')
  await waitForDevServices()
  ensureDatabase(DEV_SHADOW_DB)
  cloneProductionDatabaseIfNeeded()
  run('bunx prisma migrate deploy', 'Applying dev database migrations')
  startDevServer()
}

async function main() {
  if (args.has('--reset')) {
    assertDockerRunning()
    resetDevDocker()
    removeBuildCaches()
    console.log('✅ Pump dev setup reset complete.')
    return
  }

  if (args.has('--clean')) {
    assertDockerRunning()
    resetDevDocker()
    removeBuildCaches()
    run('bun install', 'Installing dependencies')
    await startDev()
    return
  }

  await startDev()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
