import type { FastifyTypedInstance } from '@/types/index'
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { getSessionRedisKey } from '@/modules/auth/auth.service'
import { getTestApp } from '../helper'

// Mock Google Auth
mock.module('google-auth-library', () => {
  return {
    OAuth2Client: class {
      verifyIdToken = mock(({ idToken }: { idToken: string }) => idToken === 'invalid-google-token'
        ? Promise.reject(new Error('Invalid token'))
        : Promise.resolve({
            getPayload: () => ({
              sub: 'google-123',
              email: 'test@example.com',
              email_verified: true,
              given_name: 'Test',
              family_name: 'User',
              picture: 'https://example.com/pic.jpg',
            }),
          }))
    },
  }
})

describe('Auth Module: Google Login', () => {
  let app: FastifyTypedInstance

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  it('should successfully login with Google and return a session ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { idToken: 'fake-google-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.sessionId).toBeDefined()
    expect(body.data.user.email).toBe('test@example.com')
  }, 10000)

  it('should return 401 for an invalid Google token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { idToken: 'invalid-google-token' },
    })

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body).error.code).toBe('INVALID_GOOGLE_TOKEN')
  })

  it('should return the same user when concurrent signup requests race', async () => {
    const suffix = Date.now()
    const payload = {
      sub: `google-race-${suffix}`,
      email: `race-${suffix}@example.com`,
      email_verified: true,
      given_name: 'Race',
      family_name: 'Condition',
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
    }

    const [first, second] = await Promise.all([
      app.authService.findOrCreateUser(payload),
      app.authService.findOrCreateUser(payload),
    ])

    expect(first.id).toBe(second.id)
    await app.prisma.user.delete({ where: { id: first.id } })
  })
})

describe('Auth Module: Session Authorization', () => {
  let app: FastifyTypedInstance

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  it('should be able to access a protected route with the session ID', async () => {
    // 1. Login to get session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { idToken: 'fake-google-token' },
    })
    const { data: { sessionId } } = JSON.parse(loginRes.body)

    // 2. Access protected route
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${sessionId}`,
      },
    })

    expect(logoutRes.statusCode).toBe(200)
    expect(JSON.parse(logoutRes.body).message).toBe('Logged out successfully')
  })

  it('should reject invalid session IDs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer invalid-session`,
      },
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('Auth Module: Session Rotation', () => {
  let app: FastifyTypedInstance

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  it('should rotate session if older than 7 days', async () => {
    // 1. Manually create an old session in Redis
    const user = await app.prisma.user.create({
      data: {
        email: `rotation-${Date.now()}@example.com`,
        googleId: `google-rotation-${Date.now()}`,
        firstName: 'Rotation',
        lastName: 'Test',
        profilePicUrl: '',
        role: 'systemAdmin',
        privacyPolicyAcceptedAt: new Date(),
      },
    })
    const userId = user.id
    const oldSessionId = 'old-session-id'
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (8 * 24 * 60 * 60)

    await app.redis.set(
      getSessionRedisKey(oldSessionId, app.config.SESSION_SECRET || app.config.GOOGLE_WEB_CLIENT_ID),
      JSON.stringify({
        userId,
        role: 'member',
        createdAt: sevenDaysAgo,
        lastUsed: sevenDaysAgo,
      }),
      'EX',
      30 * 24 * 60 * 60,
    )

    // 2. Use the old session
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        authorization: `Bearer ${oldSessionId}`,
      },
    })

    expect(response.statusCode).toBe(200)
    // Check for rotation header
    expect(response.headers['x-new-session-token']).toBeDefined()
    const newSessionId = String(response.headers['x-new-session-token'])
    expect(newSessionId).not.toBe(oldSessionId)

    // 3. Verify old session is deleted
    const oldSession = await app.redis.get(getSessionRedisKey(oldSessionId, app.config.SESSION_SECRET || app.config.GOOGLE_WEB_CLIENT_ID))
    expect(oldSession).toBeNull()

    // 4. Verify rotation persisted the current database role rather than the stale session role
    const newSession = await app.redis.get(getSessionRedisKey(newSessionId!, app.config.SESSION_SECRET))
    expect(JSON.parse(newSession!).role).toBe('systemAdmin')

    await app.authService.revokeSession(newSessionId!)
    await app.prisma.user.delete({ where: { id: userId } })
  })
})
