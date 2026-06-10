/* eslint-disable max-lines-per-function */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { buildApp } from '../../src/app'

describe('Cron Webhook API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should reject requests without a cron secret', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cron/reminders-dispatch',
    })

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({ error: 'Unauthorized' })
  })

  it('should reject requests with an invalid cron secret', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cron/reminders-dispatch',
      headers: {
        authorization: 'Bearer wrong-secret',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({ error: 'Unauthorized' })
  })

  it('should accept requests with the valid cron secret', async () => {
    // Note: Since this actually triggers the dispatchHabitReminders logic,
    // we just ensure the route is securely authenticated.
    // Full logic is mocked/tested inside habit.reminder.dispatcher.test.ts
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cron/reminders-dispatch',
      headers: {
        authorization: `Bearer ${app.config.CRON_SECRET}`,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).success).toBe(true)
  })

  describe('Redis Cache Shield', () => {
    const CACHE_KEY = 'habit-reminders:next-trigger-timestamp'

    beforeEach(async () => {
      await app.redis.del(CACHE_KEY)
    })

    it('should return cache_sentinel on subsequent calls when no active reminders exist', async () => {
      // First call: DB query, sets sentinel "none"
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/cron/reminders-dispatch',
        headers: { authorization: `Bearer ${app.config.CRON_SECRET}` },
      })
      expect(res1.statusCode).toBe(200)
      const body1 = JSON.parse(res1.body)
      expect(body1.source).toBe('db_query')

      const cachedValue = await app.redis.get(CACHE_KEY)
      expect(cachedValue).toBe('none')

      // Second call: returns cache_sentinel without DB query
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/cron/reminders-dispatch',
        headers: { authorization: `Bearer ${app.config.CRON_SECRET}` },
      })
      expect(res2.statusCode).toBe(200)
      const body2 = JSON.parse(res2.body)
      expect(body2.source).toBe('cache_sentinel')
    })

    it('should skip DB query and return cache_hit if current time is before the cached timestamp', async () => {
      const futureTime = Date.now() + 60000
      await app.redis.set(CACHE_KEY, futureTime.toString())

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/cron/reminders-dispatch',
        headers: { authorization: `Bearer ${app.config.CRON_SECRET}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.source).toBe('cache_hit')
      expect(new Date(body.nextTriggerAt).getTime()).toBe(futureTime)
    })

    it('should query DB and update cache if current time is past the cached timestamp', async () => {
      const pastTime = Date.now() - 60000
      await app.redis.set(CACHE_KEY, pastTime.toString())

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/cron/reminders-dispatch',
        headers: { authorization: `Bearer ${app.config.CRON_SECRET}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.source).toBe('db_query')
    })
  })
})
