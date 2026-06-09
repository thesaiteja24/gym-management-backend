import path from 'node:path'
import fp from 'fastify-plugin'

export interface AppConfig {
  NODE_ENV: string
  PORT: number

  MASTER_URL: string
  REPLICA_URL: string
  SHADOW_URL: string

  REDIS_URL: string

  SESSION_SECRET: string

  GOOGLE_WEB_CLIENT_ID: string
  GOOGLE_IOS_CLIENT_ID?: string
  GOOGLE_ANDROID_CLIENT_ID?: string

  ONESIGNAL_APP_ID?: string
  ONESIGNAL_API_KEY?: string
  ONESIGNAL_ANDROID_CHANNEL_ID?: string

  CRON_SECRET: string

  LOG_LEVEL: string
  CORS_ORIGINS?: string
  AUTH_LOGIN_RATE_LIMIT_MAX: number
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: number
  SESSION_MAX_PER_USER: number
  DB_POOL_MAX: number
  DB_POOL_IDLE_TIMEOUT_MS: number
  DB_POOL_CONNECTION_TIMEOUT_MS: number
}

const envProperties = {
  NODE_ENV: { type: 'string', default: 'development' },
  PORT: { type: 'number', minimum: 1, maximum: 65535, default: 3000 },
  MASTER_URL: { type: 'string' },
  REPLICA_URL: { type: 'string' },
  SHADOW_URL: { type: 'string' },
  REDIS_URL: { type: 'string' },
  SESSION_SECRET: { type: 'string', minLength: 32 },
  GOOGLE_WEB_CLIENT_ID: { type: 'string' },
  GOOGLE_IOS_CLIENT_ID: { type: 'string' },
  GOOGLE_ANDROID_CLIENT_ID: { type: 'string' },
  ONESIGNAL_APP_ID: { type: 'string' },
  ONESIGNAL_API_KEY: { type: 'string' },
  ONESIGNAL_ANDROID_CHANNEL_ID: { type: 'string' },
  CRON_SECRET: { type: 'string', minLength: 32 },
  LOG_LEVEL: { type: 'string', default: 'info' },
  CORS_ORIGINS: { type: 'string' },
  AUTH_LOGIN_RATE_LIMIT_MAX: { type: 'number', minimum: 1, maximum: 100, default: 10 },
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: { type: 'number', minimum: 1000, maximum: 3600000, default: 60000 },
  SESSION_MAX_PER_USER: { type: 'number', minimum: 1, maximum: 100, default: 10 },
  DB_POOL_MAX: { type: 'number', minimum: 1, maximum: 100, default: 10 },
  DB_POOL_IDLE_TIMEOUT_MS: { type: 'number', minimum: 1000, maximum: 300000, default: 30000 },
  DB_POOL_CONNECTION_TIMEOUT_MS: { type: 'number', minimum: 1000, maximum: 60000, default: 5000 },
}

const envSchema = {
  type: 'object',
  required: [
    'MASTER_URL',
    'REDIS_URL',
    'GOOGLE_WEB_CLIENT_ID',
    'SESSION_SECRET',
    'CRON_SECRET',
  ],
  properties: envProperties,
}

function buildEnvSchema() {
  return envSchema
}

function getDotenvPath() {
  if (process.env.NODE_ENV === 'production') {
    return path.resolve(process.cwd(), '.env')
  }

  return path.resolve(process.cwd(), '.env.development')
}

export const envPlugin = fp(async (app) => {
  await app.register(import('@fastify/env'), {
    schema: buildEnvSchema(),
    dotenv: process.env.NODE_ENV === 'test'
      ? false
      : { path: getDotenvPath() },
  })
})
