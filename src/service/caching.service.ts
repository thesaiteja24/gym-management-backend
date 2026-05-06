import { Redis } from 'ioredis'
import type { StringValue } from 'ms'
import ms from 'ms'

import { logger } from '../utils/logger.js'

const redisClient = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error('Redis connection retries exhausted (3/3)')
      return null // Stop retrying after 3 times
    }
    logger.warn(`Redis connection failed, retrying... (${times}/3)`)
    return 1500 // 1.5 seconds delay
  },
})

// Eager connect for early failure detection
redisClient.connect().catch((err) => {
  logger.error({ err }, 'Redis initial connection completely failed')
})

redisClient.on('connect', () => {
  logger.info('Redis client successfully connected')
})

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis connection error')
})

redisClient.on('ready', async () => {
  // Health check ping
  try {
    const pong = await redisClient.ping()
    if (pong !== 'PONG') {
      logger.error('Redis ping failed')
    }
  } catch (err) {
    logger.error({ err }, 'Redis health check ping failed')
  }
})

redisClient.on('close', () => {
  logger.warn('Redis connection closed')
})

process.on('SIGINT', async () => {
  if (redisClient) {
    await redisClient.quit()
  }
  process.exit(0)
})

interface TTLResult {
  seconds: number
  milliseconds: number
}

// Handle TTL parsing and validation
export const ttlHandler = (providedTTL: string): TTLResult => {
  if (!providedTTL) throw new Error('TTL is missing')

  try {
    const milliseconds = ms(providedTTL as StringValue)
    const seconds = milliseconds / 1000

    if (isNaN(seconds) || seconds <= 0) {
      throw new Error('Invalid TTL format or non-positive value')
    }

    return { seconds, milliseconds }
  } catch {
    throw new Error(`TTL Error: parse error`)
  }
}

// --- Refresh Token Management ---
export const setRefreshToken = async (
  userId: string,
  token: string,
  providedTTL: string,
  renew: boolean = false,
): Promise<boolean> => {
  const ttl = ttlHandler(providedTTL)
  const key = 'refreshToken:' + userId

  let result: string | null
  if (renew) {
    result = await redisClient.set(key, token, 'EX', ttl.seconds)
  } else {
    result = await redisClient.set(key, token, 'EX', ttl.seconds, 'NX')
  }

  if (result !== 'OK') {
    throw new Error(
      `Failed to set Refresh Token: ${renew ? 'Unexpected Redis error' : 'Cache key already exists'}`,
    )
  }

  return true
}

// Retrieving the refresh token using userId as key
export const getRefreshToken = async (userId: string): Promise<string | null> => {
  const key = `refreshToken:${userId}`
  return (await redisClient.get(key)) || null
}

// Deleting the refresh token using userId as key
export const deleteRefreshToken = async (userId: string): Promise<boolean> => {
  const key = `refreshToken:${userId}`
  const deleted = await redisClient.del(key)
  return deleted > 0
}

export const setCache = async (
  key: string,
  value: unknown,
  providedTTL: string,
): Promise<boolean> => {
  const ttl = ttlHandler(providedTTL)

  const result = await redisClient.set(key, JSON.stringify(value), 'EX', ttl.seconds)
  if (result !== 'OK') {
    throw new Error('Failed to set cache')
  }

  return true
}

export const getCache = async <T = unknown>(key: string): Promise<T | null> => {
  const cachedValue = await redisClient.get(key)
  return cachedValue ? (JSON.parse(cachedValue) as T) : null
}

export const deleteCache = async (key: string): Promise<boolean> => {
  const deleted = await redisClient.del(key)
  return deleted > 0
}

export const invalidateCachePattern = async (pattern: string): Promise<void> => {
  const stream = redisClient.scanStream({ match: pattern })
  for await (const keys of stream) {
    if (keys.length > 0) {
      await redisClient.del(...keys)
    }
  }
}

export { redisClient }
