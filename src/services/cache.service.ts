import type { FastifyRedis } from '@fastify/redis'

export async function cacheGet<T>(
  redis: FastifyRedis,
  key: string,
): Promise<T | null> {
  const data = await redis.get(key)

  return data ? JSON.parse(data) : null
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
  const cachedData = await cacheGet<T>(redis, key)
  if (cachedData !== null) {
    return cachedData
  }

  const freshData = await factory()
  await cacheSet(redis, key, freshData, ttlSeconds)
  return freshData
}
