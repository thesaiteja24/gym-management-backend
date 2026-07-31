import type { FastifyTypedInstance } from '@/types/index'
import { UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getTestApp } from '../helper'

describe('Workout catalog', () => {
  let app: FastifyTypedInstance
  let userId: string
  let sessionId: string

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
    const suffix = Date.now()
    const user = await app.prisma.user.create({
      data: {
        email: `workout-catalog-${suffix}@example.com`,
        googleId: `workout-catalog-google-${suffix}`,
        firstName: 'Workout',
        lastName: 'Catalog',
        profilePicUrl: '',
        privacyPolicyAcceptedAt: new Date(),
      },
    })
    userId = user.id
    sessionId = await app.authService.createSession(user.id, UserRole.member)
  })

  afterAll(async () => {
    await app?.prisma.user.deleteMany({ where: { id: userId } })
    await app?.close()
  })

  it('returns the shared equipment, muscle-group, and exercise catalog', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/workouts/catalog',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(response.statusCode).toBe(200)
    const catalog = JSON.parse(response.body).data
    expect(catalog).toEqual({
      equipment: expect.any(Array),
      muscleGroups: expect.any(Array),
      exercises: expect.any(Array),
    })
  })
})
