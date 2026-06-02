import type { FastifyTypedInstance } from '@/types/index'
import { UserRole } from '@prisma/client'
import { z } from 'zod'
import { ApiResponseSchema, HttpError, sendSuccess } from '@/utils/response'

const GoogleLoginResponseDataSchema = z.object({
  sessionId: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.enum(UserRole).default('member'),
  }),
})

const GoogleLoginSchema = {
  body: z.object({
    idToken: z.string().min(1).max(8192),
  }).strict(),
  response: {
    200: ApiResponseSchema(GoogleLoginResponseDataSchema),
  },
}

const LogoutSchema = {
  response: {
    200: ApiResponseSchema(z.null()),
  },
}

function registerDocsGoogleLoginRoute(app: FastifyTypedInstance) {
  app.post(
    '/auth/docs/google',
    {
      schema: {
        ...GoogleLoginSchema,
        description: 'Login to the API docs as an existing Pump user with a Google ID Token',
        tags: ['Authentication'],
      },
      config: {
        rateLimit: {
          max: app.config.AUTH_LOGIN_RATE_LIMIT_MAX,
          timeWindow: app.config.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request, reply) => {
      const payload = await app.authService.verifyGoogleToken(request.body.idToken)
      if (!payload) {
        throw new HttpError(400, 'INVALID_GOOGLE_TOKEN', 'Invalid Google Token')
      }

      const user = await app.authService.findExistingUserForDocs(payload)
      const sessionId = await app.authService.createSession(user.id, user.role)

      return sendSuccess(reply, {
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      }, 'Logged in successfully')
    },
  )
}

export async function authRoutes(app: FastifyTypedInstance) {
  /**
   * Login or signup with Google
   */
  app.post(
    '/auth/google',
    {
      schema: {
        ...GoogleLoginSchema,
        description: 'Login or signup with Google ID Token',
        tags: ['Authentication'],
      },
      config: {
        rateLimit: {
          max: app.config.AUTH_LOGIN_RATE_LIMIT_MAX,
          timeWindow: app.config.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request, reply) => {
      const { idToken } = request.body

      // Verify Google Token
      const payload = await app.authService.verifyGoogleToken(idToken)
      if (!payload) {
        throw new HttpError(400, 'INVALID_GOOGLE_TOKEN', 'Invalid Google Token')
      }

      // Find or create user
      const user = await app.authService.findOrCreateUser(payload)

      // Create session
      const sessionId = await app.authService.createSession(user.id, user.role)

      return sendSuccess(
        reply,
        {
          sessionId,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        },
        'Logged in successfully',
      )
    },
  )

  registerDocsGoogleLoginRoute(app)

  /**
   * Revoke current session
   */
  app.post(
    '/auth/logout',
    {
      schema: {
        ...LogoutSchema,
        description: 'Logout and revoke current session',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      await app.authService.revokeSession(request.sessionId)

      return sendSuccess(reply, null, 'Logged out successfully')
    },
  )
}
