import type { FastifyTypedInstance } from '@/types/index'
import { z } from 'zod'
import { ApiResponseSchema, sendSuccess } from '@/utils/response'
import * as habitReminderService from './habit.reminder.service'
import {
  HabitIdParamsSchema,
  HabitReminderCreateReqSchema,
  HabitReminderParamsSchema,
  HabitReminderResSchema,
  HabitReminderUpdateReqSchema,
} from './habit.schema'

export function registerHabitReminderRoutes(app: FastifyTypedInstance) {
  registerHabitReminderReadRoutes(app)
  registerHabitReminderWriteRoutes(app)
}

function registerHabitReminderReadRoutes(app: FastifyTypedInstance) {
  app.get('/habits/:habitId/reminders', {
    schema: {
      description: 'List reminders for a habit',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      response: {
        200: ApiResponseSchema(z.array(HabitReminderResSchema)),
      },
    },
  }, async (request, reply) => {
    const reminders = await habitReminderService.listHabitReminders(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
    })
    return sendSuccess(reply, reminders, 'Habit reminders fetched successfully')
  })

  app.post('/habits/:habitId/reminders', {
    schema: {
      description: 'Create a habit reminder',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitIdParamsSchema,
      body: HabitReminderCreateReqSchema,
      response: {
        200: ApiResponseSchema(HabitReminderResSchema),
      },
    },
  }, async (request, reply) => {
    const reminder = await habitReminderService.createHabitReminder(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
      data: request.body,
    })
    return sendSuccess(reply, reminder, 'Habit reminder created successfully')
  })

  app.get('/habits/:habitId/reminders/:reminderId', {
    schema: {
      description: 'Get a habit reminder',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitReminderParamsSchema,
      response: {
        200: ApiResponseSchema(HabitReminderResSchema),
      },
    },
  }, async (request, reply) => {
    const reminder = await habitReminderService.getHabitReminder(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
      reminderId: request.params.reminderId,
    })
    return sendSuccess(reply, reminder, 'Habit reminder fetched successfully')
  })
}

function registerHabitReminderWriteRoutes(app: FastifyTypedInstance) {
  app.patch('/habits/:habitId/reminders/:reminderId', {
    schema: {
      description: 'Update a habit reminder',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitReminderParamsSchema,
      body: HabitReminderUpdateReqSchema,
      response: {
        200: ApiResponseSchema(HabitReminderResSchema),
      },
    },
  }, async (request, reply) => {
    const reminder = await habitReminderService.updateHabitReminder(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
      reminderId: request.params.reminderId,
      data: request.body,
    })
    return sendSuccess(reply, reminder, 'Habit reminder updated successfully')
  })

  app.delete('/habits/:habitId/reminders/:reminderId', {
    schema: {
      description: 'Delete a habit reminder',
      tags: ['Habits'],
      security: [{ bearerAuth: [] }],
      params: HabitReminderParamsSchema,
      response: {
        200: ApiResponseSchema(HabitReminderResSchema),
      },
    },
  }, async (request, reply) => {
    const reminder = await habitReminderService.deleteHabitReminder(app, {
      userId: request.user!.id,
      habitId: request.params.habitId,
      reminderId: request.params.reminderId,
    })
    return sendSuccess(reply, reminder, 'Habit reminder deleted successfully')
  })
}
