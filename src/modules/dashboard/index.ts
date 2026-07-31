import type { FastifyTypedInstance } from '@/types/index'
import { ApiResponseSchema, sendSuccess } from '@/utils/response'
import { DashboardHabitsResSchema, DashboardStreakResSchema } from './dashboard.schema'
import { getDashboardHabitCards, getDashboardStreak } from './dashboard.service'

export async function dashboardRoutes(app: FastifyTypedInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/dashboard/streak', {
    schema: {
      description: 'Get the user activity streak and completed dates from the last 30 days',
      tags: ['Dashboard'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(DashboardStreakResSchema),
      },
    },
  }, async (request, reply) => {
    const streak = await getDashboardStreak(app, request.user!.id)
    return sendSuccess(reply, streak, 'Dashboard streak fetched successfully')
  })

  app.get('/dashboard/habits', {
    schema: {
      description: 'Get active habits with calendar-month heatmaps and current-period progress',
      tags: ['Dashboard'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(DashboardHabitsResSchema),
      },
    },
  }, async (request, reply) => {
    const habits = await getDashboardHabitCards(app, request.user!.id)
    return sendSuccess(reply, habits, 'Dashboard habits fetched successfully')
  })
}
