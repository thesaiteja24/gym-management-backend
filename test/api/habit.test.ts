/* eslint-disable max-lines, max-lines-per-function */
import type { FastifyTypedInstance } from '@/types/index'
import {
  FitnessLevel,
  HabitCategory,
  HabitReminderDeliveryStatus,
  HabitSource,
  HabitTrackingType,
  InternalHabitMetric,
  UserRole,
} from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { backfillInternalHabitLogs } from '@/modules/habit/habit.internal.backfill.service'
import { reconcileInternalHabitLogs } from '@/modules/habit/habit.internal.service'
import { dispatchHabitReminders, replayFailedHabitReminderDeliveries } from '@/modules/habit/habit.reminder.dispatcher'
import {
  getHabitReminderSchedulerHealth,
  recordHabitReminderSchedulerExecution,
} from '@/modules/habit/habit.reminder.operations'
import { calculateNextReminderTrigger } from '@/modules/habit/habit.reminder.service'
import { OneSignalError } from '@/services/onesignal.service'
import { getTestApp } from '../helper'

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function utcDateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

function startOfWeek(date: Date, weekStartsOn: number) {
  const day = date.getUTCDay()
  return addDays(date, -((day - weekStartsOn + 7) % 7))
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

async function upsertInternalHabit(app: FastifyTypedInstance, input: {
  userId: string
  title: string
  category: HabitCategory
  internalMetric: InternalHabitMetric
  startDate: Date
}) {
  const habit = await app.prisma.habit.upsert({
    where: {
      userId_source_internalMetric: {
        userId: input.userId,
        source: HabitSource.internal,
        internalMetric: input.internalMetric,
      },
    },
    update: {
      title: input.title,
      category: input.category,
      trackingType: HabitTrackingType.binary,
      source: HabitSource.internal,
      startDate: input.startDate,
      endDate: null,
      isActive: true,
    },
    create: {
      userId: input.userId,
      title: input.title,
      category: input.category,
      trackingType: HabitTrackingType.binary,
      source: HabitSource.internal,
      internalMetric: input.internalMetric,
      startDate: input.startDate,
    },
  })

  await app.prisma.habitLog.deleteMany({
    where: { habitId: habit.id },
  })

  return habit
}

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
      await app.prisma.workoutLog.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await app.prisma.userProgram.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await app.prisma.program.deleteMany({ where: { createdBy: { in: [userId, otherUserId] } } })
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

  it('rejects unsupported target period changes and invalid log payloads', async () => {
    const weeklyQuantityRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Weekly Water',
        category: 'nutrition',
        trackingType: 'quantity',
        targetPeriod: 'weekly',
        targetValue: 21,
        unit: 'L',
        startDate: '2026-06-02',
      },
    })
    expect(weeklyQuantityRes.statusCode).toBe(400)

    const countMissingTargetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Workout Count',
        category: 'training',
        trackingType: 'count',
        targetPeriod: 'weekly',
        startDate: '2026-06-02',
      },
    })
    expect(countMissingTargetRes.statusCode).toBe(400)

    const binaryHabit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Journal',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: '2026-06-02',
      },
    })).body).data

    const unsupportedUpdateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${binaryHabit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { targetPeriod: 'weekly' },
    })
    expect(unsupportedUpdateRes.statusCode).toBe(400)

    const binaryMissingCompletedRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${binaryHabit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { note: 'No completion value' },
    })
    expect(binaryMissingCompletedRes.statusCode).toBe(400)

    const quantityHabit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Water Validation',
        category: 'nutrition',
        trackingType: 'quantity',
        targetValue: 3,
        unit: 'L',
        startDate: '2026-06-02',
      },
    })).body).data

    const targetClearedRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${quantityHabit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { targetValue: null },
    })
    expect(targetClearedRes.statusCode).toBe(400)

    const quantityMissingValueRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${quantityHabit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { note: 'No value' },
    })
    expect(quantityMissingValueRes.statusCode).toBe(400)

    const negativeValueRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${quantityHabit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: -1 },
    })
    expect(negativeValueRes.statusCode).toBe(400)
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

  it('lists habit logs within an optional date range', async () => {
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Log History Habit',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: '2026-06-01',
      },
    })).body).data

    for (const date of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/habits/${habit.id}/logs/${date}`,
        headers: { authorization: `Bearer ${sessionId}` },
        payload: { completed: true },
      })
      expect(res.statusCode).toBe(200)
    }

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/logs?startDate=2026-06-02&endDate=2026-06-03`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(listRes.statusCode).toBe(200)
    expect(JSON.parse(listRes.body).data.map((log: { date: string }) => log.date.slice(0, 10))).toEqual([
      '2026-06-02',
      '2026-06-03',
    ])
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

  it('rejects cross-user habit log mutations and stats access', async () => {
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Private Habit',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: '2026-06-02',
      },
    })).body).data

    const crossUserLogRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${otherSessionId}` },
      payload: { completed: true },
    })
    expect(crossUserLogRes.statusCode).toBe(404)

    const crossUserStatsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${otherSessionId}` },
    })
    expect(crossUserStatsRes.statusCode).toBe(404)

    const crossUserDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${habit.id}/logs/2026-06-02`,
      headers: { authorization: `Bearer ${otherSessionId}` },
    })
    expect(crossUserDeleteRes.statusCode).toBe(404)
  })

  it('blocks manual writes to internal habit logs', async () => {
    const today = utcDateOnly(dateKey(new Date()))
    const internalHabit = await upsertInternalHabit(app, {
      userId,
      title: 'Complete Workout Internal',
      category: HabitCategory.training,
      internalMetric: InternalHabitMetric.workoutCompleted,
      startDate: today,
    })

    const writeRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${internalHabit.id}/logs/${dateKey(today)}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { completed: true },
    })
    expect(writeRes.statusCode).toBe(403)

    await app.prisma.habitLog.create({
      data: {
        habitId: internalHabit.id,
        date: today,
        completed: true,
        source: 'internal',
      },
    })

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${internalHabit.id}/logs/${dateKey(today)}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(deleteRes.statusCode).toBe(403)
    expect(await app.prisma.habitLog.count({ where: { habitId: internalHabit.id } })).toBe(1)
  })

  it('creates default internal habits on first internal list fetch', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/internal',
      headers: { authorization: `Bearer ${otherSessionId}` },
    })

    expect(listRes.statusCode).toBe(200)
    const habits = JSON.parse(listRes.body).data
    expect(habits).toHaveLength(3)
    expect(habits.every((habit: { source: string }) => habit.source === 'internal')).toBe(true)
    expect(habits.every((habit: { isActive: boolean }) => habit.isActive)).toBe(true)
    expect(habits.map((habit: { internalMetric: string }) => habit.internalMetric).sort()).toEqual([
      'programDayCompleted',
      'weightLogged',
      'workoutCompleted',
    ])

    expect(await app.prisma.habit.count({
      where: {
        userId: otherUserId,
        source: HabitSource.internal,
      },
    })).toBe(3)
  })

  it('toggles internal habits without recreating duplicates', async () => {
    const initialRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/internal',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(initialRes.statusCode).toBe(200)
    const initialHabits = JSON.parse(initialRes.body).data
    const initialWorkoutHabit = initialHabits.find((habit: { internalMetric: string }) => habit.internalMetric === 'workoutCompleted')
    expect(initialWorkoutHabit).toBeTruthy()

    const disableRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/habits/internal/workoutCompleted',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { isActive: false },
    })
    expect(disableRes.statusCode).toBe(200)
    expect(JSON.parse(disableRes.body).data.isActive).toBe(false)

    const activeListRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(activeListRes.statusCode).toBe(200)
    expect(JSON.parse(activeListRes.body).data.some((habit: { internalMetric: string | null }) => habit.internalMetric === 'workoutCompleted')).toBe(false)

    const reenableRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/habits/internal/workoutCompleted',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { isActive: true },
    })
    expect(reenableRes.statusCode).toBe(200)
    const reenabledHabit = JSON.parse(reenableRes.body).data
    expect(reenabledHabit.isActive).toBe(true)
    expect(reenabledHabit.id).toBe(initialWorkoutHabit.id)

    expect(await app.prisma.habit.count({
      where: {
        userId,
        source: HabitSource.internal,
        internalMetric: InternalHabitMetric.workoutCompleted,
      },
    })).toBe(1)
  })

  it('blocks generic updates to internal habits and backfills when re-enabled', async () => {
    const internalHabitRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/internal',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(internalHabitRes.statusCode).toBe(200)
    const internalHabit = JSON.parse(internalHabitRes.body).data.find((habit: { internalMetric: string }) => habit.internalMetric === 'workoutCompleted')

    await app.prisma.habit.update({
      where: { id: internalHabit.id },
      data: {
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })

    const disableRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/habits/internal/workoutCompleted',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { isActive: false },
    })
    expect(disableRes.statusCode).toBe(200)

    const blockedUpdateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${internalHabit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { title: 'Renamed Internal Habit' },
    })
    expect(blockedUpdateRes.statusCode).toBe(403)

    await app.prisma.workoutLog.create({
      data: {
        userId,
        title: 'Backfilled After Re-enable',
        startTime: new Date('2026-06-04T09:00:00.000Z'),
        endTime: new Date('2026-06-04T10:00:00.000Z'),
      },
    })

    const reenableRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/habits/internal/workoutCompleted',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { isActive: true },
    })
    expect(reenableRes.statusCode).toBe(200)

    const internalLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-06-04T00:00:00.000Z'),
        },
      },
    })
    expect(internalLog?.completed).toBe(true)
    expect(Number(internalLog?.value)).toBe(1)
  })

  it('filters today habits by active date window and preserves sort order', async () => {
    const today = utcDateOnly(dateKey(new Date()))
    const yesterday = addDays(today, -1)
    const tomorrow = addDays(today, 1)
    const activeSecond = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Today Sort Second',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: dateKey(today),
        sortOrder: 52,
      },
    })).body).data
    const activeFirst = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Today Sort First',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: dateKey(today),
        sortOrder: 51,
      },
    })).body).data
    const futureHabit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Future Habit',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: dateKey(tomorrow),
      },
    })).body).data
    const endedHabit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Ended Habit',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: dateKey(addDays(today, -3)),
        endDate: dateKey(yesterday),
      },
    })).body).data
    const archivedHabit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Archived Today Habit',
        category: 'lifestyle',
        trackingType: 'binary',
        startDate: dateKey(today),
      },
    })).body).data

    const archiveRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${archivedHabit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(archiveRes.statusCode).toBe(200)

    const todayRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/today',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(todayRes.statusCode).toBe(200)
    const todayIds = JSON.parse(todayRes.body).data.map((item: { id: string }) => item.id)
    expect(todayIds).toContain(activeFirst.id)
    expect(todayIds).toContain(activeSecond.id)
    expect(todayIds).not.toContain(futureHabit.id)
    expect(todayIds).not.toContain(endedHabit.id)
    expect(todayIds).not.toContain(archivedHabit.id)
    expect(todayIds.indexOf(activeFirst.id)).toBeLessThan(todayIds.indexOf(activeSecond.id))
  })

  it('returns today habits with derived progress and current streak', async () => {
    const today = utcDateOnly(dateKey(new Date()))
    const yesterday = addDays(today, -1)
    const twoDaysAgo = addDays(today, -2)
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Sleep',
        category: 'recovery',
        trackingType: 'duration',
        targetValue: 8,
        unit: 'hours',
        startDate: dateKey(twoDaysAgo),
      },
    })).body).data

    for (const logDate of [twoDaysAgo, yesterday, today]) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/habits/${habit.id}/logs/${dateKey(logDate)}`,
        headers: { authorization: `Bearer ${sessionId}` },
        payload: { value: 8 },
      })
      expect(res.statusCode).toBe(200)
    }

    const todayRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/today',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(todayRes.statusCode).toBe(200)
    const todayHabit = JSON.parse(todayRes.body).data.find((item: { id: string }) => item.id === habit.id)
    expect(todayHabit.todayValue).toBe(8)
    expect(todayHabit.completed).toBe(true)
    expect(todayHabit.currentStreak).toBe(3)
  })

  it('derives daily stats from logs after historical edits and deletes', async () => {
    const today = utcDateOnly(dateKey(new Date()))
    const yesterday = addDays(today, -1)
    const twoDaysAgo = addDays(today, -2)
    const threeDaysAgo = addDays(today, -3)
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Stretch',
        category: 'recovery',
        trackingType: 'duration',
        targetValue: 10,
        unit: 'minutes',
        startDate: dateKey(threeDaysAgo),
      },
    })).body).data

    for (const [logDate, value] of [
      [threeDaysAgo, 10],
      [twoDaysAgo, 10],
      [yesterday, 5],
      [today, 10],
    ] as const) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/habits/${habit.id}/logs/${dateKey(logDate)}`,
        headers: { authorization: `Bearer ${sessionId}` },
        payload: { value },
      })
      expect(res.statusCode).toBe(200)
    }

    const initialStatsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(initialStatsRes.statusCode).toBe(200)
    const initialStats = JSON.parse(initialStatsRes.body).data
    expect(initialStats.currentStreak).toBe(1)
    expect(initialStats.bestStreak).toBe(2)
    expect(initialStats.totalCompletedPeriods).toBe(3)

    const editRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/${dateKey(yesterday)}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: 10 },
    })
    expect(editRes.statusCode).toBe(200)

    const editedStatsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const editedStats = JSON.parse(editedStatsRes.body).data
    expect(editedStats.currentStreak).toBe(4)
    expect(editedStats.bestStreak).toBe(4)
    expect(editedStats.totalCompletedPeriods).toBe(4)

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${habit.id}/logs/${dateKey(twoDaysAgo)}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(deleteRes.statusCode).toBe(200)

    const deletedStatsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const deletedStats = JSON.parse(deletedStatsRes.body).data
    expect(deletedStats.currentStreak).toBe(2)
    expect(deletedStats.bestStreak).toBe(2)
    expect(deletedStats.totalCompletedPeriods).toBe(3)
  })

  it('derives weekly count stats from the configured week boundary', async () => {
    const today = utcDateOnly(dateKey(new Date()))
    const weekStart = startOfWeek(today, 1)
    const elapsedWeekDays = Math.floor((today.getTime() - weekStart.getTime()) / 86_400_000) + 1
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Workout Weekly',
        category: 'training',
        trackingType: 'count',
        targetPeriod: 'weekly',
        targetValue: elapsedWeekDays,
        startDate: dateKey(weekStart),
      },
    })).body).data

    for (const offset of Array.from({ length: elapsedWeekDays }, (_, index) => index)) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/habits/${habit.id}/logs/${dateKey(addDays(weekStart, offset))}`,
        headers: { authorization: `Bearer ${sessionId}` },
        payload: { value: 1 },
      })
      expect(res.statusCode).toBe(200)
    }

    const statsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(statsRes.statusCode).toBe(200)
    const stats = JSON.parse(statsRes.body).data
    expect(stats.streakPeriod).toBe('weekly')
    expect(stats.currentStreak).toBe(1)
    expect(stats.bestStreak).toBe(1)
    expect(stats.weeklyCompletion).toBe(100)
    expect(stats.monthlyCompletion).toBe(100)

    const todayRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/today',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const todayHabit = JSON.parse(todayRes.body).data.find((item: { id: string }) => item.id === habit.id)
    expect(todayHabit.todayValue).toBe(elapsedWeekDays)
    expect(todayHabit.completed).toBe(true)
  })

  it('uses user weekStartsOn when summing weekly count habits', async () => {
    await app.prisma.user.update({
      where: { id: userId },
      data: { weekStartsOn: 0 },
    })
    const today = utcDateOnly(dateKey(new Date()))
    const sundayWeekStart = startOfWeek(today, 0)
    const previousSaturday = addDays(sundayWeekStart, -1)
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Sunday Boundary Workout',
        category: 'training',
        trackingType: 'count',
        targetPeriod: 'weekly',
        targetValue: 1,
        startDate: dateKey(previousSaturday),
      },
    })).body).data

    const previousWeekLogRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/${dateKey(previousSaturday)}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: 1 },
    })
    expect(previousWeekLogRes.statusCode).toBe(200)

    const statsBeforeCurrentWeekRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const statsBeforeCurrentWeek = JSON.parse(statsBeforeCurrentWeekRes.body).data
    expect(statsBeforeCurrentWeek.weeklyCompletion).toBe(0)
    expect(statsBeforeCurrentWeek.currentStreak).toBe(0)

    const currentWeekLogRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/${dateKey(sundayWeekStart)}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: 1 },
    })
    expect(currentWeekLogRes.statusCode).toBe(200)

    const statsAfterCurrentWeekRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const statsAfterCurrentWeek = JSON.parse(statsAfterCurrentWeekRes.body).data
    expect(statsAfterCurrentWeek.weeklyCompletion).toBe(100)
    expect(statsAfterCurrentWeek.currentStreak).toBe(2)
  })

  it('derives monthly count progress from current month logs only', async () => {
    const today = utcDateOnly(dateKey(new Date()))
    const monthStart = startOfMonth(today)
    const previousMonthDate = addMonths(monthStart, -1)
    const habit = JSON.parse((await app.inject({
      method: 'POST',
      url: '/api/v1/habits',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        title: 'Monthly Weigh Ins',
        category: 'bodyMetrics',
        trackingType: 'count',
        targetPeriod: 'monthly',
        targetValue: 2,
        startDate: dateKey(previousMonthDate),
      },
    })).body).data

    for (const logDate of [previousMonthDate, monthStart]) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/habits/${habit.id}/logs/${dateKey(logDate)}`,
        headers: { authorization: `Bearer ${sessionId}` },
        payload: { value: 1 },
      })
      expect(res.statusCode).toBe(200)
    }

    const incompleteStatsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(incompleteStatsRes.statusCode).toBe(200)
    const incompleteStats = JSON.parse(incompleteStatsRes.body).data
    expect(incompleteStats.currentStreak).toBe(0)
    expect(incompleteStats.monthlyCompletion).toBe(0)

    const secondCurrentMonthLogRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/habits/${habit.id}/logs/${dateKey(today)}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { value: today.getTime() === monthStart.getTime() ? 2 : 1 },
    })
    expect(secondCurrentMonthLogRes.statusCode).toBe(200)

    const completeStatsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/stats`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const completeStats = JSON.parse(completeStatsRes.body).data
    expect(completeStats.streakPeriod).toBe('monthly')
    expect(completeStats.currentStreak).toBe(1)
    expect(completeStats.bestStreak).toBe(1)
    expect(completeStats.monthlyCompletion).toBe(100)

    const todayRes = await app.inject({
      method: 'GET',
      url: '/api/v1/habits/today',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const todayHabit = JSON.parse(todayRes.body).data.find((item: { id: string }) => item.id === habit.id)
    expect(todayHabit.todayValue).toBe(2)
    expect(todayHabit.completed).toBe(true)
  })

  it('reconciles internal weightLogged habits from measurement create, update, and delete', async () => {
    await app.prisma.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Kolkata' },
    })
    const internalHabit = await upsertInternalHabit(app, {
      userId,
      title: 'Log Weight Internal',
      category: HabitCategory.bodyMetrics,
      internalMetric: InternalHabitMetric.weightLogged,
      startDate: new Date('2026-05-17T00:00:00.000Z'),
    })

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-17T20:00:00.000Z',
        weight: 82.5,
      },
    })
    expect(createRes.statusCode).toBe(200)
    const measurement = JSON.parse(createRes.body).data

    const firstLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-18T00:00:00.000Z'),
        },
      },
    })
    expect(firstLog?.completed).toBe(true)
    expect(Number(firstLog?.value)).toBe(1)
    expect(firstLog?.source).toBe('internal')

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/me/measurements/${measurement.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-19T00:00:00.000Z',
        weight: 83,
      },
    })
    expect(updateRes.statusCode).toBe(200)
    expect(await app.prisma.habitLog.count({
      where: {
        habitId: internalHabit.id,
        date: new Date('2026-05-18T00:00:00.000Z'),
      },
    })).toBe(0)

    const movedLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-19T00:00:00.000Z'),
        },
      },
    })
    expect(movedLog?.completed).toBe(true)
    expect(Number(movedLog?.value)).toBe(1)

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/me/measurements/${measurement.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(deleteRes.statusCode).toBe(200)
    expect(await app.prisma.habitLog.count({ where: { habitId: internalHabit.id } })).toBe(0)
  })

  it('reconciles internal workoutCompleted habits idempotently when workouts move or are deleted', async () => {
    await app.prisma.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Kolkata' },
    })
    const internalHabit = await upsertInternalHabit(app, {
      userId,
      title: 'Workout Completed Internal',
      category: HabitCategory.training,
      internalMetric: InternalHabitMetric.workoutCompleted,
      startDate: new Date('2026-05-17T00:00:00.000Z'),
    })
    const firstWorkout = await app.prisma.workoutLog.create({
      data: {
        userId,
        title: 'Push',
        startTime: new Date('2026-05-17T20:00:00.000Z'),
        endTime: new Date('2026-05-17T21:00:00.000Z'),
      },
    })
    const secondWorkout = await app.prisma.workoutLog.create({
      data: {
        userId,
        title: 'Pull',
        startTime: new Date('2026-05-18T01:00:00.000Z'),
        endTime: new Date('2026-05-18T02:00:00.000Z'),
      },
    })

    await reconcileInternalHabitLogs(app, {
      userId,
      metric: InternalHabitMetric.workoutCompleted,
      localDates: ['2026-05-18'],
    })
    await reconcileInternalHabitLogs(app, {
      userId,
      metric: InternalHabitMetric.workoutCompleted,
      localDates: ['2026-05-18'],
    })

    const firstLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-18T00:00:00.000Z'),
        },
      },
    })
    expect(firstLog?.completed).toBe(true)
    expect(Number(firstLog?.value)).toBe(2)
    expect(await app.prisma.habitLog.count({ where: { habitId: internalHabit.id } })).toBe(1)

    await app.prisma.workoutLog.update({
      where: { id: firstWorkout.id },
      data: { deletedAt: new Date('2026-05-18T03:00:00.000Z') },
    })
    await app.prisma.workoutLog.update({
      where: { id: secondWorkout.id },
      data: {
        startTime: new Date('2026-05-19T01:00:00.000Z'),
        endTime: new Date('2026-05-19T02:00:00.000Z'),
      },
    })

    await reconcileInternalHabitLogs(app, {
      userId,
      metric: InternalHabitMetric.workoutCompleted,
      localDates: ['2026-05-18', '2026-05-19'],
    })

    expect(await app.prisma.habitLog.count({
      where: {
        habitId: internalHabit.id,
        date: new Date('2026-05-18T00:00:00.000Z'),
      },
    })).toBe(0)
    const movedLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-19T00:00:00.000Z'),
        },
      },
    })
    expect(movedLog?.completed).toBe(true)
    expect(Number(movedLog?.value)).toBe(1)
  })

  it('reconciles internal programDayCompleted habits when program days complete, move, or become incomplete', async () => {
    await app.prisma.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Kolkata' },
    })
    const internalHabit = await upsertInternalHabit(app, {
      userId,
      title: 'Program Day Completed Internal',
      category: HabitCategory.training,
      internalMetric: InternalHabitMetric.programDayCompleted,
      startDate: new Date('2026-05-17T00:00:00.000Z'),
    })
    const program = await app.prisma.program.create({
      data: {
        clientId: `habit-program-${Date.now()}`,
        title: 'Habit Program',
        durationOptions: [4],
        experienceLevel: FitnessLevel.beginner,
        createdBy: userId,
      },
    })
    const userProgram = await app.prisma.userProgram.create({
      data: {
        userId,
        programId: program.id,
        startDate: new Date('2026-05-17T00:00:00.000Z'),
        durationWeeks: 4,
      },
    })
    const week = await app.prisma.userProgramWeek.create({
      data: {
        userProgramId: userProgram.id,
        weekIndex: 0,
      },
    })
    const day = await app.prisma.userProgramDay.create({
      data: {
        userProgramWeekId: week.id,
        name: 'Day 1',
        dayIndex: 0,
        isRestDay: false,
        completed: true,
        completedAt: new Date('2026-05-17T20:00:00.000Z'),
      },
    })

    await reconcileInternalHabitLogs(app, {
      userId,
      metric: InternalHabitMetric.programDayCompleted,
      localDates: ['2026-05-18'],
    })

    const firstLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-18T00:00:00.000Z'),
        },
      },
    })
    expect(firstLog?.completed).toBe(true)
    expect(Number(firstLog?.value)).toBe(1)

    await app.prisma.userProgramDay.update({
      where: { id: day.id },
      data: { completedAt: new Date('2026-05-19T00:00:00.000Z') },
    })
    await reconcileInternalHabitLogs(app, {
      userId,
      metric: InternalHabitMetric.programDayCompleted,
      localDates: ['2026-05-18', '2026-05-19'],
    })

    expect(await app.prisma.habitLog.count({
      where: {
        habitId: internalHabit.id,
        date: new Date('2026-05-18T00:00:00.000Z'),
      },
    })).toBe(0)
    const movedLog = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-19T00:00:00.000Z'),
        },
      },
    })
    expect(movedLog?.completed).toBe(true)
    expect(Number(movedLog?.value)).toBe(1)

    await app.prisma.userProgramDay.update({
      where: { id: day.id },
      data: { completed: false, completedAt: null },
    })
    await reconcileInternalHabitLogs(app, {
      userId,
      metric: InternalHabitMetric.programDayCompleted,
      localDates: ['2026-05-19'],
    })
    expect(await app.prisma.habitLog.count({ where: { habitId: internalHabit.id } })).toBe(0)
  })

  it('backfills internal habit logs for existing source records', async () => {
    const internalHabit = await upsertInternalHabit(app, {
      userId,
      title: 'Backfill Workout Internal',
      category: HabitCategory.training,
      internalMetric: InternalHabitMetric.workoutCompleted,
      startDate: new Date('2026-05-20T00:00:00.000Z'),
    })
    await app.prisma.workoutLog.create({
      data: {
        userId,
        title: 'Backfilled Workout',
        startTime: new Date('2026-05-20T09:00:00.000Z'),
        endTime: new Date('2026-05-20T10:00:00.000Z'),
      },
    })

    const result = await backfillInternalHabitLogs(app, {
      userId,
      metrics: [InternalHabitMetric.workoutCompleted],
      startDate: '2026-05-20',
      endDate: '2026-05-20',
    })

    expect(result.targets).toBeGreaterThanOrEqual(1)
    expect(result.reconciledDates).toBeGreaterThanOrEqual(1)
    const log = await app.prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: internalHabit.id,
          date: new Date('2026-05-20T00:00:00.000Z'),
        },
      },
    })
    expect(log?.completed).toBe(true)
    expect(Number(log?.value)).toBe(1)
  })

  it('calculates reminder nextTriggerAt from local timezone, time, and weekdays', () => {
    const nextTriggerAt = calculateNextReminderTrigger({
      time: '07:30',
      timezone: 'Asia/Kolkata',
      daysOfWeek: [1],
      now: new Date('2026-06-01T00:00:00.000Z'),
    })

    expect(nextTriggerAt.toISOString()).toBe('2026-06-01T02:00:00.000Z')

    const nextWeekTriggerAt = calculateNextReminderTrigger({
      time: '05:00',
      timezone: 'Asia/Kolkata',
      daysOfWeek: [1],
      now: new Date('2026-06-01T00:00:00.000Z'),
    })

    expect(nextWeekTriggerAt.toISOString()).toBe('2026-06-07T23:30:00.000Z')
  })

  it('creates, reads, updates, disables, deletes, and archives habit reminders', async () => {
    await app.prisma.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Kolkata' },
    })
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Reminder Habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        source: HabitSource.manual,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })

    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/habits/${habit.id}/reminders`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '07:30',
        daysOfWeek: [5, 1, 3],
      },
    })
    expect(createRes.statusCode).toBe(200)
    const reminder = JSON.parse(createRes.body).data
    expect(reminder.habitId).toBe(habit.id)
    expect(reminder.time).toBe('07:30')
    expect(reminder.timezone).toBe('Asia/Kolkata')
    expect(reminder.daysOfWeek).toEqual([1, 3, 5])
    expect(reminder.isEnabled).toBe(true)
    expect(reminder.nextTriggerAt).toBeString()

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/reminders`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(listRes.statusCode).toBe(200)
    expect(JSON.parse(listRes.body).data.map((item: { id: string }) => item.id)).toEqual([reminder.id])

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/habits/${habit.id}/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(getRes.statusCode).toBe(200)
    expect(JSON.parse(getRes.body).data.id).toBe(reminder.id)

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${habit.id}/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '21:15',
        timezone: 'America/New_York',
        daysOfWeek: [2],
      },
    })
    expect(updateRes.statusCode).toBe(200)
    const updatedReminder = JSON.parse(updateRes.body).data
    expect(updatedReminder.time).toBe('21:15')
    expect(updatedReminder.timezone).toBe('America/New_York')
    expect(updatedReminder.daysOfWeek).toEqual([2])
    expect(updatedReminder.nextTriggerAt).toBeString()
    expect(updatedReminder.nextTriggerAt).not.toBe(reminder.nextTriggerAt)

    const disableRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${habit.id}/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { isEnabled: false },
    })
    expect(disableRes.statusCode).toBe(200)
    const disabledReminder = JSON.parse(disableRes.body).data
    expect(disabledReminder.isEnabled).toBe(false)
    expect(disabledReminder.nextTriggerAt).toBeNull()

    const enableRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${habit.id}/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { isEnabled: true },
    })
    expect(enableRes.statusCode).toBe(200)
    expect(JSON.parse(enableRes.body).data.nextTriggerAt).toBeString()

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${habit.id}/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(deleteRes.statusCode).toBe(200)
    expect(JSON.parse(deleteRes.body).data.id).toBe(reminder.id)
    expect(await app.prisma.habitReminder.findUnique({
      where: { id: reminder.id },
    })).toBeNull()

    const archiveRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/habits/${habit.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(archiveRes.statusCode).toBe(200)
  })

  it('validates reminder payloads and verifies reminder ownership through the habit', async () => {
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Reminder Validation Habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        source: HabitSource.manual,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })
    const reminder = await app.prisma.habitReminder.create({
      data: {
        habitId: habit.id,
        time: '08:00',
        timezone: 'UTC',
        daysOfWeek: [1],
        nextTriggerAt: new Date('2026-07-01T08:00:00.000Z'),
      },
    })

    const invalidTimeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/habits/${habit.id}/reminders`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '24:00',
        timezone: 'UTC',
        daysOfWeek: [1],
      },
    })
    expect(invalidTimeRes.statusCode).toBe(400)

    const invalidTimezoneRes = await app.inject({
      method: 'POST',
      url: `/api/v1/habits/${habit.id}/reminders`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '07:30',
        timezone: 'Mars/Base',
        daysOfWeek: [1],
      },
    })
    expect(invalidTimezoneRes.statusCode).toBe(400)

    const duplicateDaysRes = await app.inject({
      method: 'POST',
      url: `/api/v1/habits/${habit.id}/reminders`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '07:30',
        timezone: 'UTC',
        daysOfWeek: [1, 1],
      },
    })
    expect(duplicateDaysRes.statusCode).toBe(400)

    const duplicateConfigCreateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/habits/${habit.id}/reminders`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '08:00',
        timezone: 'UTC',
        daysOfWeek: [1],
      },
    })
    expect(duplicateConfigCreateRes.statusCode).toBe(409)

    const secondReminder = await app.prisma.habitReminder.create({
      data: {
        habitId: habit.id,
        time: '09:00',
        timezone: 'UTC',
        daysOfWeek: [2],
        nextTriggerAt: new Date('2026-07-02T09:00:00.000Z'),
      },
    })

    const duplicateConfigUpdateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${habit.id}/reminders/${secondReminder.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '08:00',
        timezone: 'UTC',
        daysOfWeek: [1],
      },
    })
    expect(duplicateConfigUpdateRes.statusCode).toBe(409)

    const crossUserUpdateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/habits/${habit.id}/reminders/${reminder.id}`,
      headers: { authorization: `Bearer ${otherSessionId}` },
      payload: { time: '09:00' },
    })
    expect(crossUserUpdateRes.statusCode).toBe(404)

    const missingHabitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/habits/00000000-0000-0000-0000-000000000000/reminders',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        time: '07:30',
        timezone: 'UTC',
        daysOfWeek: [1],
      },
    })
    expect(missingHabitRes.statusCode).toBe(404)
  })

  it('claims due reminders, sends one delivery, and advances nextTriggerAt', async () => {
    const now = new Date('2026-06-04T09:01:00.000Z')
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Dispatch Habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        source: HabitSource.manual,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })
    const reminder = await app.prisma.habitReminder.create({
      data: {
        habitId: habit.id,
        time: '09:00',
        timezone: 'UTC',
        daysOfWeek: [4],
        nextTriggerAt: new Date('2026-06-04T09:00:00.000Z'),
      },
    })
    const sentDeliveries: string[] = []

    const result = await dispatchHabitReminders(app, {
      now,
      pushClient: {
        async sendHabitReminder(input) {
          sentDeliveries.push(input.deliveryId)
          expect(input.userId).toBe(userId)
          expect(input.habitTitle).toBe('Dispatch Habit')
          return { providerId: 'onesignal-message-id' }
        },
      },
    })

    expect(result.claimed).toBe(1)
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0)
    const delivery = await app.prisma.habitReminderDelivery.findUnique({
      where: {
        reminderId_scheduledAt: {
          reminderId: reminder.id,
          scheduledAt: new Date('2026-06-04T09:00:00.000Z'),
        },
      },
    })
    expect(delivery).not.toBeNull()
    expect(delivery?.status).toBe(HabitReminderDeliveryStatus.sent)
    expect(delivery?.attempts).toBe(1)
    expect(delivery?.providerId).toBe('onesignal-message-id')
    expect(sentDeliveries).toEqual([delivery!.id])

    const advancedReminder = await app.prisma.habitReminder.findUnique({
      where: { id: reminder.id },
    })
    expect(advancedReminder?.nextTriggerAt?.toISOString()).toBe('2026-06-11T09:00:00.000Z')

    const secondResult = await dispatchHabitReminders(app, {
      now,
      pushClient: {
        async sendHabitReminder() {
          throw new Error('should not send twice')
        },
      },
    })
    expect(secondResult.claimed).toBe(0)
    expect(secondResult.sent).toBe(0)
    expect(secondResult.failed).toBe(0)
    expect(secondResult.skipped).toBe(0)
    expect(await app.prisma.habitReminderDelivery.count({
      where: { reminderId: reminder.id },
    })).toBe(1)
  })

  it('skips stale due reminders and still advances the reminder schedule', async () => {
    const now = new Date('2026-06-04T09:06:01.000Z')
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Stale Reminder Habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        source: HabitSource.manual,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })
    const reminder = await app.prisma.habitReminder.create({
      data: {
        habitId: habit.id,
        time: '09:00',
        timezone: 'UTC',
        daysOfWeek: [4],
        nextTriggerAt: new Date('2026-06-04T09:00:00.000Z'),
      },
    })
    let sendCount = 0

    const result = await dispatchHabitReminders(app, {
      now,
      pushClient: {
        async sendHabitReminder() {
          sendCount += 1
          return {}
        },
      },
    })

    expect(result.claimed).toBe(1)
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(sendCount).toBe(0)

    const delivery = await app.prisma.habitReminderDelivery.findUnique({
      where: {
        reminderId_scheduledAt: {
          reminderId: reminder.id,
          scheduledAt: new Date('2026-06-04T09:00:00.000Z'),
        },
      },
    })
    expect(delivery?.status).toBe(HabitReminderDeliveryStatus.skipped)

    const advancedReminder = await app.prisma.habitReminder.findUnique({
      where: { id: reminder.id },
    })
    expect(advancedReminder?.nextTriggerAt?.toISOString()).toBe('2026-06-11T09:00:00.000Z')
  })

  it('retries failed deliveries with the same idempotency key and without duplicate delivery rows', async () => {
    const now = new Date('2026-06-04T09:01:00.000Z')
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Retry Reminder Habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        source: HabitSource.manual,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })
    const reminder = await app.prisma.habitReminder.create({
      data: {
        habitId: habit.id,
        time: '09:00',
        timezone: 'UTC',
        daysOfWeek: [4],
        nextTriggerAt: new Date('2026-06-04T09:00:00.000Z'),
      },
    })

    const firstResult = await dispatchHabitReminders(app, {
      now,
      pushClient: {
        async sendHabitReminder() {
          throw new OneSignalError('temporary timeout', true)
        },
      },
    })
    expect(firstResult.claimed).toBe(1)
    expect(firstResult.sent).toBe(0)
    expect(firstResult.failed).toBe(1)
    expect(firstResult.skipped).toBe(0)

    const failedDelivery = await app.prisma.habitReminderDelivery.findUnique({
      where: {
        reminderId_scheduledAt: {
          reminderId: reminder.id,
          scheduledAt: new Date('2026-06-04T09:00:00.000Z'),
        },
      },
    })
    expect(failedDelivery).not.toBeNull()
    expect(failedDelivery?.status).toBe(HabitReminderDeliveryStatus.failed)
    expect(failedDelivery?.attempts).toBe(1)

    const retriedDeliveryIds: string[] = []
    const secondResult = await dispatchHabitReminders(app, {
      now: new Date('2026-06-04T09:02:00.000Z'),
      pushClient: {
        async sendHabitReminder(input) {
          retriedDeliveryIds.push(input.deliveryId)
          return { providerId: 'retry-provider-id' }
        },
      },
    })

    expect(secondResult.claimed).toBe(0)
    expect(secondResult.sent).toBe(1)
    expect(secondResult.failed).toBe(0)
    expect(secondResult.skipped).toBe(0)
    expect(retriedDeliveryIds).toEqual([failedDelivery!.id])
    expect(await app.prisma.habitReminderDelivery.count({
      where: { reminderId: reminder.id },
    })).toBe(1)

    const sentDelivery = await app.prisma.habitReminderDelivery.findUnique({
      where: { id: failedDelivery!.id },
    })
    expect(sentDelivery?.status).toBe(HabitReminderDeliveryStatus.sent)
    expect(sentDelivery?.attempts).toBe(2)
    expect(sentDelivery?.providerId).toBe('retry-provider-id')
  })

  it('records scheduler heartbeat and reports stale or failed scheduler health', async () => {
    const startedAt = new Date('2026-06-04T09:00:00.000Z')
    const finishedAt = new Date('2026-06-04T09:00:02.000Z')

    await recordHabitReminderSchedulerExecution(app, {
      status: 'success',
      startedAt,
      finishedAt,
      result: {
        claimed: 1,
        sent: 1,
        failed: 0,
        skipped: 0,
      },
    })

    const healthy = await getHabitReminderSchedulerHealth(app, {
      now: new Date('2026-06-04T09:04:00.000Z'),
      thresholdMs: 5 * 60 * 1000,
    })
    expect(healthy.healthy).toBe(true)
    expect(healthy.lastExecution?.result?.sent).toBe(1)

    const stale = await getHabitReminderSchedulerHealth(app, {
      now: new Date('2026-06-04T09:06:00.000Z'),
      thresholdMs: 5 * 60 * 1000,
    })
    expect(stale.healthy).toBe(false)

    await recordHabitReminderSchedulerExecution(app, {
      status: 'failed',
      startedAt,
      finishedAt: new Date('2026-06-04T09:05:00.000Z'),
      error: new Error('scheduler crashed'),
    })

    const failed = await getHabitReminderSchedulerHealth(app, {
      now: new Date('2026-06-04T09:05:30.000Z'),
      thresholdMs: 5 * 60 * 1000,
    })
    expect(failed.healthy).toBe(false)
    expect(failed.lastExecution?.error).toBe('scheduler crashed')
  })

  it('manually replays retryable failed reminder deliveries', async () => {
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Manual Replay Habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        source: HabitSource.manual,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    })
    const reminder = await app.prisma.habitReminder.create({
      data: {
        habitId: habit.id,
        time: '09:00',
        timezone: 'UTC',
        daysOfWeek: [4],
        nextTriggerAt: new Date('2026-06-11T09:00:00.000Z'),
      },
    })
    const delivery = await app.prisma.habitReminderDelivery.create({
      data: {
        reminderId: reminder.id,
        scheduledAt: new Date('2026-06-04T09:00:00.000Z'),
        status: HabitReminderDeliveryStatus.failed,
        attempts: 1,
        lastError: 'temporary timeout',
      },
    })
    const replayedIds: string[] = []

    const result = await replayFailedHabitReminderDeliveries(app, {
      now: new Date('2026-06-04T09:10:00.000Z'),
      pushClient: {
        async sendHabitReminder(input) {
          replayedIds.push(input.deliveryId)
          return { providerId: 'manual-replay-provider-id' }
        },
      },
    })

    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(replayedIds).toEqual([delivery.id])

    const replayed = await app.prisma.habitReminderDelivery.findUnique({
      where: { id: delivery.id },
    })
    expect(replayed?.status).toBe(HabitReminderDeliveryStatus.sent)
    expect(replayed?.attempts).toBe(2)
    expect(replayed?.providerId).toBe('manual-replay-provider-id')
  })
})
