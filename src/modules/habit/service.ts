import { HabitSource } from '@prisma/client'

import { prisma, readPrisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/ApiError.js'

import type { CreateHabitBody, Habit, HabitLog, HabitLogsMap, UpdateHabitBody } from './types.js'

// CONSTANTS



// HELPERS

/**
 * Formats a Prisma habit object into the expected Habit interface.
 */
const formatHabit = (habit: any): Habit => ({
  ...habit,
  targetValue: habit.targetValue ? Number(habit.targetValue) : null,
})

/**
 * Formats a Prisma habit log object into the expected HabitLog interface.
 */
const formatHabitLog = (log: any): HabitLog => ({
  id: log.id,
  habitId: log.habitId,
  date: log.date.toISOString(),
  value: Number(log.value),
})

// FUNCTIONS

/**
 * Fetch all habits for a user.
 */
export async function getHabits(userId: string): Promise<Habit[]> {
  const habits = await readPrisma.habit.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  return habits.map(formatHabit)
}

/**
 * Create a new habit for a user.
 */
export async function createHabit(userId: string, body: CreateHabitBody): Promise<Habit> {
  if (body.internalMetricId) {
    const existing = await prisma.habit.findFirst({
      where: { userId, internalMetricId: body.internalMetricId },
    })
    if (existing) throw new ApiError(400, 'Already tracking this metric')
  }

  const habit = await prisma.habit.create({
    data: { ...body, userId },
  })
  return formatHabit(habit)
}

/**
 * Update an existing habit.
 */
export async function updateHabit(id: string, body: UpdateHabitBody): Promise<Habit> {
  const existing = await prisma.habit.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Habit not found')

  const habit = await prisma.habit.update({
    where: { id },
    data: body,
  })
  return formatHabit(habit)
}

/**
 * Delete a habit.
 */
export async function deleteHabit(id: string): Promise<void> {
  const existing = await prisma.habit.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Habit not found')

  await prisma.habit.delete({ where: { id } })
}

/**
 * Log progress for a habit.
 */
export async function logHabit(habitId: string, date: string, value: number): Promise<HabitLog> {
  const existing = await prisma.habit.findUnique({ where: { id: habitId } })
  if (!existing) throw new ApiError(404, 'Habit not found')

  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)

  const log = await prisma.habitLog.upsert({
    where: { habitId_date: { habitId, date: d } },
    update: { value },
    create: { habitId, date: d, value },
  })

  return formatHabitLog(log)
}

/**
 * Fetch and process habit logs for a user within a date range.
 * Includes both manual logs and system-tracked (internal) metrics.
 */
export async function getProcessedHabitLogs(
  userId: string,
  startDate?: string,
  endDate?: string,
): Promise<HabitLogsMap> {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate ? new Date(endDate) : new Date()

  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(23, 59, 59, 999)

  const habits = await readPrisma.habit.findMany({ where: { userId } })
  const manualLogs = await readPrisma.habitLog.findMany({
    where: { habit: { userId }, date: { gte: start, lte: end } },
  })

  const logsMap: HabitLogsMap = {}
  habits.forEach((h) => {
    logsMap[h.id] = []
  })

  // Add manual logs
  manualLogs.forEach((log) => {
    if (logsMap[log.habitId]) {
      logsMap[log.habitId].push({
        date: log.date.toISOString(),
        value: Number(log.value),
      })
    }
  })

  // Process internal (system-tracked) habits
  const internalHabits = habits.filter((h) => h.source === HabitSource.internal)
  if (internalHabits.length > 0) {
    const metrics = internalHabits.map((h) => h.internalMetricId)
    const needsMeasurements = metrics.some((m) => ['weight', 'bodyFat', 'waist'].includes(m || ''))
    const needsWorkouts = metrics.includes('workout')

    const [measurements, workouts] = await Promise.all([
      needsMeasurements
        ? readPrisma.userMeasurement.findMany({
            where: { userId, date: { gte: start, lte: end } },
            select: { date: true, weight: true, bodyFat: true, waist: true },
          })
        : Promise.resolve([]),
      needsWorkouts
        ? readPrisma.workoutLog.findMany({
            where: { userId, startTime: { gte: start, lte: end }, deletedAt: null },
            select: { startTime: true },
          })
        : Promise.resolve([]),
    ])

    internalHabits.forEach((h) => {
      const metric = h.internalMetricId
      if (metric === 'workout') {
        const counts: Record<string, number> = {}
        workouts.forEach((w) => {
          if (w.startTime) {
            const ds = new Date(w.startTime).toISOString().split('T')[0]
            counts[ds] = (counts[ds] || 0) + 1
          }
        })
        Object.entries(counts).forEach(([ds, val]) =>
          logsMap[h.id].push({
            date: new Date(ds).toISOString(),
            value: val,
          }),
        )
      } else if (['weight', 'bodyFat', 'waist'].includes(metric || '')) {
        measurements.forEach((m) => {
          if (
            (metric === 'weight' && m.weight !== null) ||
            (metric === 'bodyFat' && m.bodyFat !== null) ||
            (metric === 'waist' && m.waist !== null)
          ) {
            logsMap[h.id].push({
              date: m.date.toISOString(),
              value: 1,
            })
          }
        })
      }
    })
  }

  return logsMap
}
