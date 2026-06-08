import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

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

function quote(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

interface EnvSection {
  comment: string
  keys: string[]
}

const envSections: EnvSection[] = [
  {
    comment: 'Runtime',
    keys: ['NODE_ENV', 'PORT'],
  },
  {
    comment: 'Database Connection Strings',
    keys: ['MASTER_URL', 'REPLICA_URL', 'SHADOW_URL'],
  },
  {
    comment: 'Redis Cache Service URL',
    keys: ['REDIS_URL'],
  },
  {
    comment: 'Session token hashing secret. Required in production.',
    keys: ['SESSION_SECRET'],
  },
  {
    comment: 'Google login throttling',
    keys: ['AUTH_LOGIN_RATE_LIMIT_MAX', 'AUTH_LOGIN_RATE_LIMIT_WINDOW_MS'],
  },
  {
    comment: 'Maximum active login sessions retained per user.',
    keys: ['SESSION_MAX_PER_USER'],
  },
  {
    comment: 'Postgres connection pool settings',
    keys: ['DB_POOL_MAX', 'DB_POOL_IDLE_TIMEOUT_MS', 'DB_POOL_CONNECTION_TIMEOUT_MS'],
  },
  {
    comment: 'OAuth Credentials',
    keys: ['GOOGLE_WEB_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID', 'GOOGLE_ANDROID_CLIENT_ID'],
  },
]

function writeEnvFile(fileName: string, values: Record<string, string>) {
  const lines: string[] = []

  for (const section of envSections) {
    const entries = section.keys.filter(key => values[key] !== undefined)
    if (entries.length === 0) {
      continue
    }

    if (lines.length > 0) {
      lines.push('')
    }

    lines.push(`# ${section.comment}`)
    for (const key of entries) {
      lines.push(`${key}=${quote(values[key]!)}`)
    }
  }

  const body = `${lines.join('\n')}\n`

  fs.writeFileSync(path.join(ROOT, fileName), body)
}

function buildSecret(existing?: string) {
  return existing && existing.length >= 32
    ? existing
    : crypto.randomBytes(32).toString('hex')
}

const productionEnv = parseEnvFile(path.join(ROOT, '.env.production'))
const currentDevEnv = parseEnvFile(path.join(ROOT, '.env.development'))

const googleWebClientId = productionEnv.GOOGLE_WEB_CLIENT_ID || 'test-client-id'
const googleIosClientId = productionEnv.GOOGLE_IOS_CLIENT_ID
const googleAndroidClientId = productionEnv.GOOGLE_ANDROID_CLIENT_ID

const sharedDevValues: Record<string, string> = {
  NODE_ENV: 'development',
  PORT: '9000',
  MASTER_URL: 'postgresql://postgres:password@localhost:9001/pump_dev?sslmode=disable',
  REPLICA_URL: 'postgresql://postgres:password@localhost:9001/pump_dev?sslmode=disable',
  SHADOW_URL: 'postgresql://postgres:password@localhost:9001/pump_shadow?sslmode=disable',
  REDIS_URL: 'redis://localhost:9002',
  SESSION_SECRET: buildSecret(currentDevEnv.SESSION_SECRET),
  GOOGLE_WEB_CLIENT_ID: googleWebClientId,
  LOG_LEVEL: 'info',
  CORS_ORIGINS: 'http://localhost:9000',
  AUTH_LOGIN_RATE_LIMIT_MAX: '10',
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  SESSION_MAX_PER_USER: '10',
  DB_POOL_MAX: '10',
  DB_POOL_IDLE_TIMEOUT_MS: '30000',
  DB_POOL_CONNECTION_TIMEOUT_MS: '5000',
}

if (googleIosClientId) {
  sharedDevValues.GOOGLE_IOS_CLIENT_ID = googleIosClientId
}

if (googleAndroidClientId) {
  sharedDevValues.GOOGLE_ANDROID_CLIENT_ID = googleAndroidClientId
}

const testValues: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '9000',
  MASTER_URL: 'postgresql://postgres:password@localhost:9003/pump_test?sslmode=disable',
  REPLICA_URL: 'postgresql://postgres:password@localhost:9003/pump_test?sslmode=disable',
  SHADOW_URL: 'postgresql://postgres:password@localhost:9003/pump_shadow?sslmode=disable',
  REDIS_URL: 'redis://localhost:9004',
  SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters',
  AUTH_LOGIN_RATE_LIMIT_MAX: '10',
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  SESSION_MAX_PER_USER: '10',
  DB_POOL_MAX: '10',
  DB_POOL_IDLE_TIMEOUT_MS: '30000',
  DB_POOL_CONNECTION_TIMEOUT_MS: '5000',
  GOOGLE_WEB_CLIENT_ID: 'test-client-id',
}

writeEnvFile('.env.development', sharedDevValues)
writeEnvFile('.env.test', testValues)

console.log('✅ Synced .env.development and .env.test')
if (!fs.existsSync(path.join(ROOT, '.env.production'))) {
  console.log('ℹ️  .env.production was not found; using safe local defaults where needed')
}
