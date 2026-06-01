import type { FastifyRedis } from '@fastify/redis'
import type { FastifyInstance } from 'fastify'

const CACHE_VERSION_PREFIX = 'cache-version:'
const CACHE_VERSION_TTL_SECONDS = 24 * 60 * 60

const inFlightRequests = new Map<string, Promise<unknown>>()

function getCacheVersionKey(key: string) {
  return `${CACHE_VERSION_PREFIX}${key}`
}

export async function cacheGet<T>(
  redis: FastifyRedis,
  key: string,
): Promise<T | null> {
  const data = await redis.get(key)

  if (!data) {
    return null
  }

  try {
    return JSON.parse(data) as T
  }
  catch {
    await redis.del(key)
    return null
  }
}

export async function cacheSet(
  redis: FastifyRedis,
  key: string,
  value: unknown,
  ttl: number,
) {
  await redis.set(
    key,
    JSON.stringify(value),
    'EX',
    ttl,
  )
}

export async function cacheDelete(redis: FastifyRedis, key: string) {
  await redis.del(key)
}

export async function evictCache(app: FastifyInstance, key: string) {
  inFlightRequests.delete(key)

  try {
    await app.redis.eval(
      `
        redis.call("INCR", KEYS[2])
        redis.call("EXPIRE", KEYS[2], ARGV[1])
        return redis.call("DEL", KEYS[1])
      `,
      2,
      key,
      getCacheVersionKey(key),
      CACHE_VERSION_TTL_SECONDS,
    )
  }
  catch (error) {
    app.log.warn({ err: error, key }, 'Failed to evict cache key')
  }
}

async function publishCacheValue(
  redis: FastifyRedis,
  options: { key: string, version: string, value: unknown, ttlSeconds: number },
) {
  const { key, version, value, ttlSeconds } = options
  await redis.eval(
    `
      local currentVersion = redis.call("GET", KEYS[2])
      if (currentVersion or "0") ~= ARGV[1] then
        return 0
      end

      redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
      return 1
    `,
    2,
    key,
    getCacheVersionKey(key),
    version,
    JSON.stringify(value),
    ttlSeconds,
  )
}

/**
 * Attempts to retrieve data from Redis. On cache miss, executes the factory function,
 * saves the result to Redis, and returns the fresh data.
 */
export async function getOrSetCache<T>(
  redis: FastifyRedis,
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>,
): Promise<T> {
  let cachedData: T | null = null
  try {
    cachedData = await cacheGet<T>(redis, key)
  }
  catch {
    // Redis is an optimization for these reads; fall back to the source of truth.
  }

  if (cachedData !== null) {
    return cachedData
  }

  const inFlight = inFlightRequests.get(key)
  if (inFlight) {
    return inFlight as Promise<T>
  }

  const request = (async () => {
    let version: string | null | undefined
    try {
      version = await redis.get(getCacheVersionKey(key))
    }
    catch {
      // Redis is unavailable, so serve the source-of-truth result without caching it.
    }

    const freshData = await factory()

    if (version !== undefined) {
      try {
        await publishCacheValue(redis, {
          key,
          version: version ?? '0',
          value: freshData,
          ttlSeconds,
        })
      }
      catch {
        // A cache outage must not turn a successful database read into an API failure.
      }
    }

    return freshData
  })()

  inFlightRequests.set(key, request)

  try {
    return await request
  }
  finally {
    if (inFlightRequests.get(key) === request) {
      inFlightRequests.delete(key)
    }
  }
}
