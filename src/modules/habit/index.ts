import type { FastifyTypedInstance } from '@/types/index'
import { z } from 'zod'
import { ApiResponseSchema, sendSuccess } from '@/utils/response'
import * as habitLogService from './habit.log.service'
import { registerHabitReminderRoutes } from './habit.reminder.routes'
import {
  HabitCreateReqSchema,
  HabitIdParamsSchema,
  HabitInternalMetricParamsSchema,
  HabitInternalToggleReqSchema,
  HabitLogListQuerySchema,
  HabitLogParamsSchema,
  HabitLogResSchema,
  HabitLogUpsertReqSchema,
  HabitResSchema,
  HabitStatsResSchema,
  HabitTodayItemResSchema,
  HabitUpdateReqSchema,
} from './habit.schema'
import * as habitService from './habit.service'

function registerHabitListRoutes(app: FastifyTypedInstance) {
  app.get('/habits', {
    schema: {
      description: 'List active habits for the logged in user',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(z.array(HabitResSchema)),
      },
    },
  }, async (request, reply) => {
    const habits = await habitService.listHabits(app, request.user!.id)
    return sendSuccess(reply, habits, 'Habits fetched successfully')
  })
}

function registerHabitInternalRoutes(app: FastifyTypedInstance) {
  app.get('/habits/internal', {
    schema: {
      description: 'List internal habits for the logged in user, creating defaults when missing',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(z.array(HabitResSchema)),
      },
    },
  }, async (request, reply) => {
    const habits = await habitService.listInternalHabits(app, request.user!.id)
    return sendSuccess(reply, habits, 'Internal habits fetched successfully')
  })

  app.patch('/habits/internal/:metric', {
    schema: {
      description: 'Enable or disable an internal habit for the logged in user',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitInternalMetricParamsSchema,
      body: HabitInternalToggleReqSchema,
      response: {
        200: ApiResponseSchema(HabitResSchema),
      },
    },
  }, async (request, reply) => {
    const habit = await habitService.toggleInternalHabit(app, request.user!.id, request.params.metric, request.body.isActive)
    return sendSuccess(reply, habit, 'Internal habit updated successfully')
  })
}

function registerHabitCollectionRoutes(app: FastifyTypedInstance) {
  app.get('/habits/today', {
    schema: {
      description: 'List active habits with today progress and current streak',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(z.array(HabitTodayItemResSchema)),
      },
    },
  }, async (request, reply) => {
    const habits = await habitService.listTodayHabits(app, request.user!.id)
    return sendSuccess(reply, habits, 'Today habits fetched successfully')
  })

  app.post('/habits', {
    schema: {
      description: 'Create a manual habit',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      body: HabitCreateReqSchema,
      response: {
        200: ApiResponseSchema(HabitResSchema),
      },
    },
  }, async (request, reply) => {
    const habit = await habitService.createHabit(app, request.user!.id, request.body)
    return sendSuccess(reply, habit, 'Habit created successfully')
  })
}

function registerHabitItemRoutes(app: FastifyTypedInstance) {
  app.get('/habits/:habitId', {
    schema: {
      description: 'Get a habit by id',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      response: {
        200: ApiResponseSchema(HabitResSchema),
      },
    },
  }, async (request, reply) => {
    const habit = await habitService.getHabit(app, request.user!.id, request.params.habitId)
    return sendSuccess(reply, habit, 'Habit fetched successfully')
  })

  app.patch('/habits/:habitId', {
    schema: {
      description: 'Update a manual habit',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      body: HabitUpdateReqSchema,
      response: {
        200: ApiResponseSchema(HabitResSchema),
      },
    },
  }, async (request, reply) => {
    const habit = await habitService.updateHabit(app, request.user!.id, request.params.habitId, request.body)
    return sendSuccess(reply, habit, 'Habit updated successfully')
  })

  app.delete('/habits/:habitId', {
    schema: {
      description: 'Archive a habit',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      response: {
        200: ApiResponseSchema(HabitResSchema),
      },
    },
  }, async (request, reply) => {
    const habit = await habitService.archiveHabit(app, request.user!.id, request.params.habitId)
    return sendSuccess(reply, habit, 'Habit archived successfully')
  })

  app.get('/habits/:habitId/stats', {
    schema: {
      description: 'Get derived habit streak and completion stats',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      response: {
        200: ApiResponseSchema(HabitStatsResSchema),
      },
    },
  }, async (request, reply) => {
    const stats = await habitService.getHabitStats(app, request.user!.id, request.params.habitId)
    return sendSuccess(reply, stats, 'Habit stats fetched successfully')
  })
}

function registerHabitLogRoutes(app: FastifyTypedInstance) {
  app.get('/habits/:habitId/logs', {
    schema: {
      description: 'List habit logs within an optional date range',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      querystring: HabitLogListQuerySchema,
      response: {
        200: ApiResponseSchema(z.array(HabitLogResSchema)),
      },
    },
  }, async (request, reply) => {
    const logs = await habitLogService.listHabitLogs(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
      startDate: request.query.startDate,
      endDate: request.query.endDate,
    })
    return sendSuccess(reply, logs, 'Habit logs fetched successfully')
  })

  app.put('/habits/:habitId/logs/:date', {
    schema: {
      description: 'Upsert a daily habit log',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitLogParamsSchema,
      body: HabitLogUpsertReqSchema,
      response: {
        200: ApiResponseSchema(HabitLogResSchema),
      },
    },
  }, async (request, reply) => {
    const log = await habitLogService.upsertHabitLog(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
      date: request.params.date,
      data: request.body,
    })
    return sendSuccess(reply, log, 'Habit log saved successfully')
  })

  app.delete('/habits/:habitId/logs/:date', {
    schema: {
      description: 'Delete a daily habit log',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitLogParamsSchema,
      response: {
        200: ApiResponseSchema(z.null()),
      },
    },
  }, async (request, reply) => {
    await habitLogService.deleteHabitLog(app, request.user!.id, request.params.habitId, request.params.date)
    return sendSuccess(reply, null, 'Habit log deleted successfully')
  })
}

export async function habitRoutes(app: FastifyTypedInstance) {
  app.addHook('preHandler', app.authenticate)

  registerHabitListRoutes(app)
  registerHabitInternalRoutes(app)
  registerHabitCollectionRoutes(app)
  registerHabitItemRoutes(app)
  registerHabitReminderRoutes(app)
  registerHabitLogRoutes(app)
}
