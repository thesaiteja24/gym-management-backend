import type { FastifyTypedInstance } from '@/types/index'
import { z } from 'zod'
import { ApiResponseSchema, sendSuccess } from '@/utils/response'
import {
  HabitCreateReqSchema,
  HabitIdParamsSchema,
  HabitLogParamsSchema,
  HabitLogResSchema,
  HabitLogUpsertReqSchema,
  HabitResSchema,
  HabitUpdateReqSchema,
} from './habit.schema'
import * as habitService from './habit.service'

function registerHabitCollectionRoutes(app: FastifyTypedInstance) {
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
}

function registerHabitLogRoutes(app: FastifyTypedInstance) {
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
    const log = await habitService.upsertHabitLog(app, {
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
    await habitService.deleteHabitLog(app, request.user!.id, request.params.habitId, request.params.date)
    return sendSuccess(reply, null, 'Habit log deleted successfully')
  })
}

export async function habitRoutes(app: FastifyTypedInstance) {
  app.addHook('preHandler', app.authenticate)

  registerHabitCollectionRoutes(app)
  registerHabitItemRoutes(app)
  registerHabitLogRoutes(app)
}
