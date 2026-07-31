import type { FastifyTypedInstance } from '@/types/index'
import { ApiResponseSchema, sendSuccess } from '@/utils/response'
import { WorkoutCatalogResSchema } from './workout.schema'
import { getWorkoutCatalog } from './workout.service'

export async function workoutRoutes(app: FastifyTypedInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/workouts/catalog', {
    schema: {
      description: 'Get the shared exercise, equipment, and muscle-group catalog',
      tags: ['Workouts'],
      security: [{ bearerAuth: [] }],
      response: { 200: ApiResponseSchema(WorkoutCatalogResSchema) },
    },
  }, async (_request, reply) => {
    const catalog = await getWorkoutCatalog(app)
    return sendSuccess(reply, catalog, 'Workout catalog fetched successfully')
  })
}
