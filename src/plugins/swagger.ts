import type { RouteOptions } from 'fastify'
import swagger from '@fastify/swagger'
import scalarApiReference from '@scalar/fastify-api-reference'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { ApiErrorResponseSchema } from '../utils/response'

function setupRouteSwagger(routeOptions: RouteOptions) {
  const schema = routeOptions.schema || {}
  routeOptions.schema = schema

  const response = (schema.response || {}) as Record<string, unknown>
  schema.response = response

  // 1. Always document 500 Internal Server Error
  if (!response['500']) {
    response['500'] = ApiErrorResponseSchema
  }

  // 2. Document 400 Bad Request if route validates incoming data
  const keys = ['body', 'querystring', 'params', 'headers']
  const hasValidation = keys.some(k => k in schema && (schema as Record<string, unknown>)[k] !== undefined)
  if (hasValidation && !response['400']) {
    response['400'] = ApiErrorResponseSchema
  }

  // 3. Document 401 Unauthorized if route has bearerAuth security defined
  const security = schema.security as Record<string, unknown>[] | undefined
  const hasAuth = security?.some(s => 'bearerAuth' in s)
  if (hasAuth && !response['401']) {
    response['401'] = ApiErrorResponseSchema
  }
}

export const swaggerPlugin = fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Pump API',
        description: 'The Fastify-based backend for Pump',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  })

  await app.register(scalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      title: 'Pump API Reference',
      theme: 'deepSpace',
      persistAuth: true,
      orderSchemaPropertiesBy: 'preserve',
      layout: 'modern',
    },
  })

  app.get('/docs/json', async () => {
    return app.swagger()
  })

  // Automatically attach standard error schemas to Swagger responses
  app.addHook('onRoute', setupRouteSwagger)
})
