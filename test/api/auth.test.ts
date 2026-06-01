import type { FastifyTypedInstance } from '@/types/index'
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { getTestApp } from '../helper'

// Mock Google Auth
mock.module('google-auth-library', () => {
  return {
    OAuth2Client: class {
      verifyIdToken = mock(() => Promise.resolve({
        getPayload: () => ({
          sub: 'google-123',
          email: 'test@example.com',
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
    const userId = 'user-123'
    const oldSessionId = 'old-session-id'
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (8 * 24 * 60 * 60)

    await app.redis.set(
      `session:${oldSessionId}`,
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
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${oldSessionId}`,
      },
    })

    expect(response.statusCode).toBe(200)
    // Check for rotation header
    expect(response.headers['x-new-session-token']).toBeDefined()
    const newSessionId = response.headers['x-new-session-token']
    expect(newSessionId).not.toBe(oldSessionId)

    // 3. Verify old session is deleted
    const oldSession = await app.redis.get(`session:${oldSessionId}`)
    expect(oldSession).toBeNull()
  })
})
