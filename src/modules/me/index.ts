import type { FastifyTypedInstance } from '../../types'
import { z } from 'zod'
import { ApiResponseSchema, HttpError, sendSuccess } from '@/utils/response'
import {
  AnalyticsResSchema,
  FitnessResSchema,
  FitnessUpsertReqSchema,
  MeasurementEntrySchema,
  MeasurementIdParamsSchema,
  MeasurementReqSchema,
  MeasurementsQuerySchema,
  MeasurementsResSchema,
  NutritionResSchema,
  NutritionUpsertReqSchema,
  ProfileResSchema,
  ProfileUpdateReqSchema,
} from './me.schemas'
import * as meService from './me.service'

/**
 * Registers User profile retrieval and update related routes
 * @param app
 */
function registerProfileRoutes(app: FastifyTypedInstance) {
  app.get('/users/me', {
    schema: {
      description: 'Get logged in user profile',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(ProfileResSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const user = await meService.queryUserProfile(app, userId)
    return sendSuccess(reply, user, 'User profile fetched successfully')
  })

  app.patch('/users/me', {
    schema: {
      description: 'Update logged in user profile',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      body: ProfileUpdateReqSchema,
      response: {
        200: ApiResponseSchema(ProfileResSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const updated = await meService.updateUserProfile(app, userId, request.body)
    return sendSuccess(reply, updated, 'Profile updated successfully')
  })
}

/**
 * Registers User Fitness Profile related routes.
 * Which handle user fitness profile retrieval and updates
 * @param app
 */
function registerFitnessRoutes(app: FastifyTypedInstance) {
  app.get('/users/me/fitness', {
    schema: {
      description: 'Get logged in fitness profile goals and equipment',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(FitnessResSchema.nullable()),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const fitness = await meService.queryFitnessProfile(app, userId)
    return sendSuccess(reply, fitness, 'Fitness profile fetched successfully')
  })

  app.patch('/users/me/fitness', {
    schema: {
      description: 'Upsert logged in fitness profile goals and nutrition targets',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      body: FitnessUpsertReqSchema,
      response: {
        200: ApiResponseSchema(FitnessResSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const updated = await meService.upsertFitnessProfile(app, userId, request.body)
    return sendSuccess(reply, updated, 'Fitness profile updated successfully')
  })
}

/**
 * Registers User Nutrition Plan related routes.
 * @param app
 */
function registerNutritionRoutes(app: FastifyTypedInstance) {
  // GET /api/v1/users/me/nutrition — Fetch nutrition plan
  app.get('/users/me/nutrition', {
    schema: {
      description: 'Get logged in nutrition plan targets',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(NutritionResSchema.nullable()),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const nutrition = await meService.queryNutritionPlan(app, userId)
    return sendSuccess(reply, nutrition, 'Nutrition plan fetched successfully')
  })

  // PATCH /api/v1/users/me/nutrition — Upsert nutrition targets
  app.patch('/users/me/nutrition', {
    schema: {
      description: 'Upsert logged in nutrition targets',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      body: NutritionUpsertReqSchema,
      response: {
        200: ApiResponseSchema(NutritionResSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const updated = await meService.upsertNutritionPlan(app, userId, request.body)
    if (!updated) {
      throw new HttpError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update nutrition plan')
    }
    return sendSuccess(reply, updated, 'Nutrition plan updated successfully')
  })
}

/**
 * Registers User Measurement related routes.
 * @param app
 */
function registerMeasurementRoutes(app: FastifyTypedInstance) {
  // GET /api/v1/users/me/measurements — Fetch measurement history
  app.get('/users/me/measurements', {
    schema: {
      description: 'Get logged in body measurements history and logs',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      querystring: MeasurementsQuerySchema,
      response: {
        200: ApiResponseSchema(MeasurementsResSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const duration = request.query.duration

    // Parse start date from duration helper
    let startDate: Date | null = null
    const norm = duration.toLowerCase()
    if (norm !== 'all') {
      startDate = new Date()
      if (norm === 'week') {
        startDate.setDate(startDate.getDate() - 7)
      }
      else if (norm === 'month') {
        startDate.setMonth(startDate.getMonth() - 1)
      }
      else if (norm === 'year') {
        startDate.setFullYear(startDate.getFullYear() - 1)
      }
    }

    const payload = await meService.queryMeasurements(app, userId, startDate)
    return sendSuccess(reply, payload, 'Body measurements logged successfully')
  })

  // POST /api/v1/users/me/measurements — Create daily body measurement metrics
  app.post('/users/me/measurements', {
    schema: {
      description: 'Create daily body measurement metrics',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      body: MeasurementReqSchema,
      response: {
        200: ApiResponseSchema(MeasurementEntrySchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const result = await meService.createMeasurement(app, userId, request.body)
    return sendSuccess(reply, result, 'Body measurements logged successfully')
  })
}

/**
 * Registers User Measurement write actions related routes.
 * @param app
 */
function registerMeasurementWriteRoutes(app: FastifyTypedInstance) {
  // PATCH /api/v1/users/me/measurements/:id — Update daily body measurement metrics
  app.patch('/users/me/measurements/:id', {
    schema: {
      description: 'Update daily body measurement metrics',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      params: MeasurementIdParamsSchema,
      body: MeasurementReqSchema,
      response: {
        200: ApiResponseSchema(MeasurementEntrySchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const { id } = request.params
    const result = await meService.updateMeasurement(app, userId, id, request.body)
    return sendSuccess(reply, result, 'Body measurements updated successfully')
  })

  // DELETE /api/v1/users/me/measurements/:id — Delete body measurement entry
  app.delete('/users/me/measurements/:id', {
    schema: {
      description: 'Delete body measurement entry',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      params: MeasurementIdParamsSchema,
      response: {
        200: ApiResponseSchema(z.null()),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const { id } = request.params
    await meService.deleteMeasurement(app, userId, id)
    return sendSuccess(reply, null, 'Body measurement deleted successfully')
  })
}

/**
 * Registers User Analytics related routes.
 * @param app
 */
function registerAnalyticsRoutes(app: FastifyTypedInstance) {
  // GET /api/v1/users/me/analytics — Fetch workout stats & streak
  app.get('/users/me/analytics', {
    schema: {
      description: 'Get logged in user workout analytics, streak, and weekly volume',
      tags: ['Me'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ApiResponseSchema(AnalyticsResSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.id
    const analytics = await meService.queryUserAnalytics(app, userId)
    return sendSuccess(reply, analytics, 'User analytics fetched successfully')
  })
}

export async function meRoutes(app: FastifyTypedInstance) {
  // Enforce session authentication for all endpoints inside this module
  app.addHook('preHandler', app.authenticate)

  registerProfileRoutes(app)
  registerFitnessRoutes(app)
  registerNutritionRoutes(app)
  registerMeasurementRoutes(app)
  registerMeasurementWriteRoutes(app)
  registerAnalyticsRoutes(app)
}
