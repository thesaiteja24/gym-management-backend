/* eslint-disable max-lines-per-function */
import type { FastifyTypedInstance } from '@/types/index'
import { UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getTestApp } from '../helper'

describe('Habit Module: Manual habits and daily logs', () => {
  let app: FastifyTypedInstance
  let userId: string
  let otherUserId: string
  let sessionId: string
  let otherSessionId: string

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance

    const suffix = Date.now()
    const [user, otherUser] = await Promise.all([
      app.prisma.user.create({
        data: {
          email: `habit-${suffix}@example.com`,
          googleId: `habit-google-${suffix}`,
          firstName: 'Habit',
          lastName: 'Owner',
          profilePicUrl: '',
          privacyPolicyAcceptedAt: new Date(),
        },
      }),
      app.prisma.user.create({
        data: {
          email: `habit-other-${suffix}@example.com`,
          googleId: `habit-other-google-${suffix}`,
          firstName: 'Habit',
          lastName: 'Other',
          profilePicUrl: '',
          privacyPolicyAcceptedAt: new Date(),
        },
      }),
    ])

    userId = user.id
    otherUserId = otherUser.id
    sessionId = await app.authService.createSession(user.id, UserRole.member)
    otherSessionId = await app.authService.createSession(otherUser.id, UserRole.member)
  })

  afterAll(async () => {
    if (app) {
      await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
      await app.close()
    }
  })

  it('creates, lists, fetches, updates, and archives a manual habit', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Drink Water',
        category: 'nutrition',
        trackingType: 'quantity',
        targetPeriod: 'daily',
        targetValue: 3,
        unit: 'L',
        startDate: '2026-06-02',
      },
    })

    expect(createRes.statusCode).toBe(200)
    const habit = JSON.parse(createRes.body).data
    expect(habit.userId).toBe(userId)
    expect(habit.title).toBe('Drink Water')
    expect(habit.source).toBe('manual')
    expect(habit.targetValue).toBe(3)

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(listRes.statusCode).toBe(200)
    expect(JSON.parse(listRes.body).data.map((h: { id: string }) => h.id)).toContain(habit.id)

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${habit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Drink Water Daily',
        targetValue: 3.5,
      },
    })
    expect(updateRes.statusCode).toBe(200)
    expect(JSON.parse(updateRes.body).data.title).toBe('Drink Water Daily')
    expect(JSON.parse(updateRes.body).data.targetValue).toBe(3.5)

    const archiveRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${habit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(archiveRes.statusCode).toBe(200)
    expect(JSON.parse(archiveRes.body).data.isActive).toBe(false)

    const listAfterArchiveRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(JSON.parse(listAfterArchiveRes.body).data.map((h: { id: string }) => h.id)).not.toContain(habit.id)
  })

  it('validates habit target rules and rejects client-created internal habits', async () => {
    const missingUnitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Sleep',
        category: 'recovery',
        trackingType: 'duration',
        targetValue: 8,
        startDate: '2026-06-02',
      },
    })
    expect(missingUnitRes.statusCode).toBe(400)

    const internalRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Complete Workout',
        category: 'training',
        trackingType: 'binary',
        source: 'internal',
        startDate: '2026-06-02',
      },
    })
    expect(internalRes.statusCode).toBe(400)

    const invalidRangeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Stretch',
        category: 'recovery',
        trackingType: 'duration',
        targetValue: 10,
        unit: 'minutes',
        startDate: '2026-06-03',
        endDate: '2026-06-02',
      },
    })
    expect(invalidRangeRes.statusCode).toBe(400)
  })

  it('upserts one daily log per habit date and calculates completion', async () => {
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Meditate',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: '2026-06-02',
      },
    })).body).data

    const firstLogRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        completed: true,
        note: 'Morning session',
      },
    })
    expect(firstLogRes.statusCode).toBe(200)
    const firstLog = JSON.parse(firstLogRes.body).data
    expect(firstLog.completed).toBe(true)

    const secondLogRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        completed: false,
        note: 'Edited',
      },
    })
    expect(secondLogRes.statusCode).toBe(200)
    const secondLog = JSON.parse(secondLogRes.body).data
    expect(secondLog.id).toBe(firstLog.id)
    expect(secondLog.completed).toBe(false)
    expect(secondLog.note).toBe('Edited')

    const count = await app.prisma.habitLog.count({
      where: {
        habitId: habit.id,
        date: new Date('2026-06-02T00:00:00.000Z'),
      },
    })
    expect(count).toBe(1)

    const deleteLogRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(deleteLogRes.statusCode).toBe(200)
    expect(await app.prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(0)
  })

  it('calculates quantity completion and enforces habit ownership', async () => {
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Drink Water',
        category: 'nutrition',
        trackingType: 'quantity',
        targetValue: 3,
        unit: 'L',
        startDate: '2026-06-02',
      },
    })).body).data

    const incompleteRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: 2.5 },
    })
    expect(incompleteRes.statusCode).toBe(200)
    expect(JSON.parse(incompleteRes.body).data.completed).toBe(false)

    const completeRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: 3.2 },
    })
    expect(completeRes.statusCode).toBe(200)
    expect(JSON.parse(completeRes.body).data.completed).toBe(true)

    const crossUserRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}`,
      headers: { authorization: `Bearer ${otherSessionId}` },
    })
    expect(crossUserRes.statusCode).toBe(404)
  })
})
