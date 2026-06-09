import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { envPlugin } from './config/env'
import { authRoutes } from './modules/auth'
import { cronRoutes } from './modules/cron'
import { habitRoutes } from './modules/habit'
import { healthRoutes } from './modules/health'
import { meRoutes } from './modules/me'
import { authPlugin } from './plugins/auth'
import { pagesPlugin } from './plugins/pages'
import { prismaPlugin } from './plugins/prisma'
import { redisPlugin } from './plugins/redis'
import { swaggerPlugin } from './plugins/swagger'

import { HttpError } from './utils/response'

interface ValidationError {
  keyword: string
  params: unknown
  instancePath: string
  message?: string
}

function formatAdditionalPropertiesError(params: Record<string, unknown>) {
  const additionalProps = params?.additionalProperties as string[] | undefined
  const propName = (additionalProps || []).join(', ') || 'unknown'
  const label = (additionalProps || []).length > 1 ? 'properties' : 'property'
  return {
    path: propName,
    message: `Unexpected ${label} '${propName}'`,
  }
}

function formatValidationError(v: ValidationError) {
  if (v.keyword === 'additionalProperties') {
    return formatAdditionalPropertiesError(v.params as Record<string, unknown>)
  }

  const params = v.params as Record<string, unknown>
  const missingProp = params?.missingProperty as string | undefined
  const path = v.instancePath.replace(/^\//, '') || missingProp || 'body'
  const message = v.message || 'Invalid value'

  return { path, message }
}

function errorHandler(this: FastifyInstance, error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error)

  const timestamp = new Date().toISOString()

  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({
      success: false,
      message: error.message,
      error: {
        code: error.code,
        details: error.details,
      },
      meta: { timestamp },
    })
  }

  if (error.validation) {
    const details = error.validation.map(v => formatValidationError(v as unknown as ValidationError))
    return reply.status(400).send({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'BAD_REQUEST',
        details,
      },
      meta: { timestamp },
    })
  }

  const statusCode = error.statusCode ?? 500
  const message = statusCode >= 500 ? 'Internal Server Error' : error.message
  const errorCode = (error as unknown as Record<string, unknown>).code as string || 'INTERNAL_SERVER_ERROR'

  reply.status(statusCode).send({
    success: false,
    message,
    error: {
      code: errorCode,
      details: null,
    },
    meta: { timestamp },
  })
}

function parseCorsOrigins(value?: string) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

async function registerSecurityPlugins(app: FastifyInstance) {
  const allowedCorsOrigins = parseCorsOrigins(app.config.CORS_ORIGINS)

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\''],
        styleSrc: ['\'self\''],
        fontSrc: ['\'self\''],
        imgSrc: ['\'self\'', 'data:'],
        objectSrc: ['\'none\''],
        baseUri: ['\'self\''],
        frameAncestors: ['\'none\''],
      },
    },
  })
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }

      callback(null, allowedCorsOrigins.includes(origin))
    },
  })
}

export async function buildApp() {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

  const app = fastify({
    logger: isDev
      ? {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname,reqId',
            },
          },
        }
      : {
          level: 'info',
        },
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      ip: request.ip,
      user: request.user?.id ?? 'anonymous',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${reply.elapsedTime.toFixed(2)}ms`,
      userAgent: request.headers['user-agent'],
    })
    done()
  })

  // Register Plugins
  await app.register(envPlugin)
  await registerSecurityPlugins(app)
  await app.register(redisPlugin)
  await app.register(prismaPlugin)
  await app.register(rateLimit, { global: false })
  await app.register(authPlugin)
  await app.register(swaggerPlugin)
  await app.register(pagesPlugin)

  // Global Error Handler
  app.setErrorHandler(errorHandler)

  // Register Routes
  await app.register(async (v1) => {
    await v1.register(healthRoutes)
    await v1.register(authRoutes)
    await v1.register(meRoutes)
    await v1.register(habitRoutes)
    await v1.register(cronRoutes, { prefix: '/cron' })
  }, { prefix: '/api/v1' })

  return app
}
