import type { FastifyInstance } from 'fastify'

import { dispatchHabitReminders } from '../habit/habit.reminder.dispatcher'

const NEXT_TRIGGER_KEY = 'habit-reminders:next-trigger-timestamp'

async function handleRemindersDispatch(app: FastifyInstance, now: Date) {
  // 1. Try to read from Redis
  let cachedTimestamp: string | null = null
  try {
    cachedTimestamp = await app.redis.get(NEXT_TRIGGER_KEY)
  }
  catch (redisError) {
    app.log.warn(redisError, 'Redis read failed in cron route, falling back to DB')
  }

  // 2. If cached value is "none", it means no active reminders exist in DB
  if (cachedTimestamp === 'none') {
    return { success: true, source: 'cache_sentinel', result: 'No active reminders configured' }
  }

  // 3. If cache is valid and we haven't reached the next trigger time, skip DB query
  if (cachedTimestamp !== null) {
    const nextTime = Number(cachedTimestamp)
    if (!Number.isNaN(nextTime) && now.getTime() < nextTime) {
      return {
        success: true,
        source: 'cache_hit',
        nextTriggerAt: new Date(nextTime).toISOString(),
        now: now.toISOString(),
      }
    }
  }

  // 4. Cache miss or time has passed -> dispatch reminders (queries DB)
  const result = await dispatchHabitReminders(app, { now })

  // 5. Update Redis cache with the new next trigger time
  try {
    if (result.nextTriggerAt) {
      await app.redis.set(NEXT_TRIGGER_KEY, result.nextTriggerAt.getTime().toString())
    }
    else {
      // No reminders are currently scheduled, set sentinel "none"
      await app.redis.set(NEXT_TRIGGER_KEY, 'none')
    }
  }
  catch (redisError) {
    app.log.warn(redisError, 'Redis write failed in cron route')
  }

  return {
    success: true,
    source: 'db_query',
    result: {
      claimed: result.claimed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    },
    nextTriggerAt: result.nextTriggerAt ? result.nextTriggerAt.toISOString() : null,
  }
}

export async function cronRoutes(app: FastifyInstance) {
  app.post('/reminders-dispatch', async (request, reply) => {
    const authHeader = request.headers.authorization
    const expectedToken = `Bearer ${app.config.CRON_SECRET}`

    if (!authHeader || authHeader !== expectedToken) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const query = request.query as { now?: string } | undefined
    const now = query?.now ? new Date(query.now) : new Date()

    try {
      const payload = await handleRemindersDispatch(app, now)
      return reply.send(payload)
    }
    catch (error) {
      app.log.error(error, 'Error in cron dispatcher')
      return reply.status(500).send({ error: 'Internal Server Error' })
    }
  })
}
