/* eslint-disable max-lines-per-function */
import type { FastifyTypedInstance } from '@/types/index'
import { HabitCategory, HabitTrackingType, UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getTestApp } from '../helper'

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

describe('Dashboard Module', () => {
  let app: FastifyTypedInstance
  let userId: string
  let sessionId: string

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
    const suffix = Date.now()
    const user = await app.prisma.user.create({
      data: {
        email: `dashboard-${suffix}@example.com`,
        googleId: `dashboard-google-${suffix}`,
        firstName: 'Dashboard',
        lastName: 'User',
        profilePicUrl: '',
        privacyPolicyAcceptedAt: new Date(),
        timezone: 'UTC',
        weekStartsOn: 1,
      },
    })
    userId = user.id
    sessionId = await app.authService.createSession(user.id, UserRole.member)
  })

  afterAll(async () => {
    if (app && userId) {
      await app.prisma.workoutLog.deleteMany({ where: { userId } })
      await app.prisma.user.delete({ where: { id: userId } })
    }
    await app?.close()
  })

  it('returns unique completed dates from the last 30 days and consecutive active weeks', async () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const previousWeek = addDays(today, -7)
    const oldDate = addDays(today, -30)
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Dashboard habit',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        startDate: oldDate,
      },
    })

    await app.prisma.habitLog.createMany({
      data: [
        { habitId: habit.id, date: today, completed: true },
        { habitId: habit.id, date: oldDate, completed: true },
      ],
    })
    await app.prisma.workoutLog.create({
      data: { userId, startTime: previousWeek },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/streak',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body).data
    expect(body.completedDates).toEqual([dateKey(previousWeek), dateKey(today)])
    expect(body.streakWeeks).toBe(2)
  })

  it('returns active habits with a calendar-month heatmap and current-period progress', async () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const yesterday = addDays(today, -1)
    const habit = await app.prisma.habit.create({
      data: {
        userId,
        title: 'Dashboard water',
        category: HabitCategory.nutrition,
        trackingType: HabitTrackingType.quantity,
        targetValue: 4,
        unit: 'L',
        startDate: yesterday,
      },
    })

    await app.prisma.habitLog.createMany({
      data: [
        { habitId: habit.id, date: yesterday, value: 4, completed: true },
        { habitId: habit.id, date: today, value: 2, completed: false },
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/habits',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(response.statusCode).toBe(200)
    const card = JSON.parse(response.body).data.habits.find((item: { id: string }) => item.id === habit.id)
    expect(card.icon).toBe('utensils')
    expect(card.colorScheme).toBe('sky')
    expect(card.progress).toEqual({
      value: 2,
      todayValue: 2,
      targetValue: 4,
      unit: 'L',
      completionPercent: 50,
      completed: false,
      todayCompleted: false,
    })
    expect(card.monthCompletionPercent).toBe(50)
    expect(card.currentStreakDays).toBe(0)
    expect(card.heatmap).toHaveLength(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate())
    expect(card.heatmap.find((item: { date: string }) => item.date === dateKey(yesterday)).intensity).toBe(4)
    expect(card.heatmap.find((item: { date: string }) => item.date === dateKey(today)).intensity).toBe(2)
    expect(card.heatmap.find((item: { date: string }) => item.date === dateKey(today)).status).toBe('partial')
  })
})
