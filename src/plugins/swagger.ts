import type { RouteOptions } from 'fastify'
import type { FastifyTypedInstance } from '@/types/index'
import swagger from '@fastify/swagger'
import scalarApiReference from '@scalar/fastify-api-reference'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { ApiErrorResponseSchema } from '../utils/response'

const docsLoginHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pump API Docs Login</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      body { background: #0b1020; color: #eef2ff; display: grid; min-height: 100vh; margin: 0; place-items: center; }
      main { background: #151b2f; border: 1px solid #29314f; border-radius: 16px; box-sizing: border-box; max-width: 560px; padding: 32px; width: calc(100% - 32px); }
      h1 { font-size: 24px; margin-top: 0; }
      p { color: #bdc7e6; line-height: 1.5; }
      #token-panel { display: none; }
      code { background: #080c18; border-radius: 8px; display: block; margin: 16px 0; overflow-wrap: anywhere; padding: 12px; }
      button, a { border-radius: 8px; box-sizing: border-box; display: inline-block; font: inherit; padding: 10px 14px; text-decoration: none; }
      button { background: #7c8cff; border: 0; color: #071022; cursor: pointer; font-weight: 700; }
      a { color: #a9b7ff; margin-left: 8px; }
      #message { color: #ffb4ab; }
    </style>
    <script src="https://accounts.google.com/gsi/client" async></script>
  </head>
  <body>
    <main>
      <h1>Pump API Docs Login</h1>
      <p>Sign in with the same Google account you already used in the Pump app. This page cannot create a new Pump account.</p>
      <div id="google-button"></div>
    </main>
    <script>
      const clientId = __GOOGLE_CLIENT_ID__;

      window.onload = function () {
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'redirect',
          login_uri: window.location.origin + '/docs/login/callback',
        });
        google.accounts.id.renderButton(document.getElementById('google-button'), {
          theme: 'outline',
          size: 'large',
        });
      };
    </script>
  </body>
</html>`

const docsTokenHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pump API Docs Token</title>
  </head>
  <body>
    <main>
      <h1>Pump API Docs Token</h1>
      <p>Copy this API session token, open the docs, then paste it into <strong>Authorize</strong>.</p>
      <code id="session-token">__SESSION_TOKEN__</code>
      <button id="copy-token" type="button">Copy API Token</button>
      <a href="/docs/">Open API Docs</a>
    </main>
    <script>
      document.getElementById('copy-token').addEventListener('click', async function () {
        await navigator.clipboard.writeText(document.getElementById('session-token').textContent);
        this.textContent = 'Copied';
      });
    </script>
  </body>
</html>`

function getDocsLoginHtml(googleClientId: string) {
  return docsLoginHtml.replace('__GOOGLE_CLIENT_ID__', JSON.stringify(googleClientId))
}

function getDocsTokenHtml(sessionId: string) {
  return docsTokenHtml.replace('__SESSION_TOKEN__', sessionId)
}

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

function registerDocsLoginRoutes(app: FastifyTypedInstance) {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body.toString())))
  })

  app.get('/docs/login', async (_request, reply) => {
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/html')
      .send(getDocsLoginHtml(app.config.GOOGLE_WEB_CLIENT_ID))
  })

  app.post<{ Body: { credential: string } }>('/docs/login/callback', async (request, reply) => {
    const payload = await app.authService.verifyGoogleToken(request.body.credential)
    if (!payload) {
      throw new Error('Invalid Google token')
    }

    const user = await app.authService.findExistingUserForDocs(payload)
    const sessionId = await app.authService.createSession(user.id, user.role)

    return reply
      .header('Cache-Control', 'no-store')
      .type('text/html')
      .send(getDocsTokenHtml(sessionId))
  })
}

export const swaggerPlugin = fp(async (app: FastifyTypedInstance) => {
  registerDocsLoginRoutes(app)

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/docs')) {
      reply.header(
        'Content-Security-Policy',
        [
          'default-src \'self\'',
          'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' cdn.jsdelivr.net unpkg.com accounts.google.com',
          'style-src \'self\' \'unsafe-inline\' cdn.jsdelivr.net fonts.googleapis.com unpkg.com',
          'font-src \'self\' fonts.gstatic.com data:',
          'img-src \'self\' data: cdn.jsdelivr.net',
          'connect-src \'self\' accounts.google.com',
          'frame-src accounts.google.com',
          'object-src \'none\'',
          'base-uri \'self\'',
          'frame-ancestors \'none\'',
        ].join('; '),
      )
    }

    return payload
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Pump API',
        description: 'The Fastify-based backend for Pump. Existing Pump users can [get an API session token](/docs/login) with Google.',
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
