import type { FastifyRedis } from '@fastify/redis'
import type { PrismaClient, UserRole } from '@prisma/client'
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { AppConfig } from '@/config/env'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    redis: FastifyRedis
    config: AppConfig
    authService: import('@/modules/auth/auth.service').AuthService
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    user: {
      id: string
      role: UserRole
    }
    sessionId: string
  }
}

/**
 * A FastifyInstance type that is pre-configured with the TypeBox type provider, PrismaClient type, Redis type, and AppConfig type.
 * Use this in route definitions and plugins to get full type safety for schemas.
 */
export type FastifyTypedInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>
