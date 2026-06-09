import type { FastifyInstance } from 'fastify'

import { dispatchHabitReminders } from '../habit/habit.reminder.dispatcher'

export async function cronRoutes(app: FastifyInstance) {
  app.post('/reminders-dispatch', async (request, reply) => {
    const authHeader = request.headers.authorization
    const expectedToken = `Bearer ${app.config.CRON_SECRET}`

    if (!authHeader || authHeader !== expectedToken) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    try {
      const result = await dispatchHabitReminders(app)
      return reply.send({ success: true, result })
    }
    catch (error) {
      app.log.error(error, 'Error in cron dispatcher')
      return reply.status(500).send({ error: 'Internal Server Error' })
    }
  })
}
