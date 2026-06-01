import type { FastifyTypedInstance } from '@/types/index'
import { z } from 'zod'
import { ApiResponseSchema, sendSuccess } from '@/utils/response'

const HealthDataSchema = z.object({
  status: z.string(),
  uptime: z.string(),
})

const HealthResponseSchema = ApiResponseSchema(HealthDataSchema)

export async function healthRoutes(app: FastifyTypedInstance) {
  app.get(
    '/health',
    {
      schema: {
        description: 'Get API health status',
        tags: ['System'],
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      // Check database connection
      await app.prisma.$queryRaw`SELECT 1`

      return sendSuccess(reply, {
        status: 'OK',
        uptime: `${process.uptime().toFixed(2)} seconds`,
      }, 'API health status retrieved')
    },
  )
}
