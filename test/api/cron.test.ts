import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
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
    expect(response.json()).toEqual({ error: 'Unauthorized' })
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
    expect(response.json()).toEqual({ error: 'Unauthorized' })
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
    expect(response.json().success).toBe(true)
  })
})
