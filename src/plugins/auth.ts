import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { AuthService } from '@/modules/auth/auth.service'
import { HttpError } from '@/utils/response'

export const authPlugin = fp(async (app) => {
  const authService = new AuthService(app.prisma, app.redis, app.config)

  // Decorate app with auth service for use in routes
  app.decorate('authService', authService)

  /**
   * Authentication Hook
   * Validates the session token from the Authorization header.
   */
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'UNAUTHORIZED', 'No session token provided')
    }

    const sessionId = authHeader.split(' ')[1]
    if (!sessionId) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Invalid session token format')
    }

    const sessionData = await authService.getSession(sessionId)

    if (!sessionData) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Session expired or invalid')
    }

    const currentRole = await authService.getCurrentUserRole(sessionData.userId)
    if (!currentRole) {
      await authService.revokeSession(sessionId)
      throw new HttpError(401, 'UNAUTHORIZED', 'Session user no longer exists')
    }

    // Populate user on request
    request.user = {
      id: sessionData.userId,
      role: currentRole,
    }
    request.sessionId = sessionId

    // Handle Rotation (7-day trigger)
    const newSessionId = await authService.rotateSession(sessionId, {
      ...sessionData,
      role: currentRole,
    })

    if (newSessionId !== sessionId) {
      // Send new token in header if rotated
      reply.header('X-New-Session-Token', newSessionId)
      request.sessionId = newSessionId
    }
  })
})
