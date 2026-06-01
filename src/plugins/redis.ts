import fastifyRedis from '@fastify/redis'
import fp from 'fastify-plugin'

export const redisPlugin = fp(async (app) => {
  const url = app.config.REDIS_URL

  if (!url) {
    throw new Error('REDIS_URL environment variable is not set')
  }

  await app.register(fastifyRedis, { url, closeClient: true })

  app.redis.on('connect', () => {
    app.log.info('Redis connected')
  })

  app.redis.on('ready', () => {
    app.log.info('Redis ready')
  })

  app.redis.on('error', (err) => {
    app.log.error(
      { err },
      'Redis connection error',
    )
  })

  app.redis.on('close', () => {
    app.log.warn('Redis connection closed')
  })

  app.redis.on('reconnecting', () => {
    app.log.warn('Redis reconnecting...')
  })

  app.log.info('Redis connection established successfully')
})
