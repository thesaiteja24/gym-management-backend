import type { FastifyReply } from 'fastify'
import { z } from 'zod'

/**
 * Custom application error class that maps to our standard API error schema.
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Helper to dynamically generate a TypeBox success response schema.
 */
export function ApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data: dataSchema,
    meta: z.object({
      timestamp: z.string().datetime().optional(),
    }).catchall(z.unknown()).optional(),
  })
}

/**
 * Static TypeBox schema for standard API error responses.
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.object({
    code: z.string(),
    details: z.any().optional(),
  }),
  meta: z.object({
    timestamp: z.string().datetime().optional(),
  }).catchall(z.unknown()).optional(),
})

/**
 * Standard utility to send successful responses conforming to the API standard.
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message = 'Operation successful',
  meta?: Record<string, unknown>,
) {
  return reply.send({
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  })
}
