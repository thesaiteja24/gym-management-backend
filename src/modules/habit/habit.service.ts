/* eslint-disable max-lines */
import type { InternalHabitMetric } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type {
  HabitCreateInput,
  HabitUpdateInput,
} from './habit.schema'
import { HabitCategory, HabitLogSource, HabitSource, HabitTargetPeriod, HabitTrackingType } from '@prisma/client'
import { HttpError } from '@/utils/response'
import { backfillInternalHabitLogs } from './habit.internal.backfill.service'
import {
  calculateCompletionPercentage,
  calculateStreakStats,
  getLocalDateKey,
  getPeriodForDate,
  isPeriodCompleted,
  sumLogValues,
  toDateKey,
} from './habit.stats'

const habitSelect = {
  id: true,
  userId: true,
  title: true,
  description: true,
  icon: true,
  colorScheme: true,
  category: true,
  trackingType: true,
  targetPeriod: true,
  targetValue: true,
  unit: true,
  source: true,
  internalMetric: true,
  isActive: true,
  startDate: true,
  endDate: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const

const internalHabitDefinitions: Record<InternalHabitMetric, {
  title: string
  description: string
  icon: string
  colorScheme: string
  category: HabitCategory
  sortOrder: number
}> = {
  workoutCompleted: {
    title: 'Workout Logged',
    description: 'Automatically completed when you log a workout.',
    icon: 'bolt.heart.fill',
    colorScheme: 'voltage',
    category: HabitCategory.training,
    sortOrder: 900,
  },
  programDayCompleted: {
    title: 'Program Day Finished',
    description: 'Automatically completed when a scheduled program day is finished.',
    icon: 'checklist',
    colorScheme: 'sky',
    category: HabitCategory.training,
    sortOrder: 910,
  },
  weightLogged: {
    title: 'Weight Logged',
    description: 'Automatically completed when a weight entry is recorded.',
    icon: 'scalemass',
    colorScheme: 'graphite',
    category: HabitCategory.bodyMetrics,
    sortOrder: 920,
  },
}

export const habitLogSelect = {
  id: true,
  habitId: true,
  date: true,
  value: true,
  completed: true,
  source: true,
  note: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const

export function toDateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

function toNullableDateOnly(date?: string | null) {
  if (date === undefined) {
    return undefined
  }

  return date === null ? null : toDateOnly(date)
}

function toNullableTargetValue(value?: number | null) {
  return value === undefined ? undefined : value
}

async function getUserDatePreferences(app: FastifyInstance, userId: string) {
  const user = await app.prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      weekStartsOn: true,
    },
  })

  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', 'User not found')
  }

  return user
}

async function ensureInternalHabitRows(app: FastifyInstance, userId: string) {
  const user = await getUserDatePreferences(app, userId)
  const today = toDateOnly(getLocalDateKey(user.timezone))
  const existing = await app.prisma.habit.findMany({
    where: {
      userId,
      source: HabitSource.internal,
      internalMetric: { not: null },
    },
    select: {
      internalMetric: true,
    },
  })
  const existingMetrics = new Set(existing.map(item => item.internalMetric).filter(Boolean))
  const missingMetrics = Object.entries(internalHabitDefinitions)
    .filter(([metric]) => !existingMetrics.has(metric as InternalHabitMetric))

  if (missingMetrics.length > 0) {
    await app.prisma.habit.createMany({
      data: missingMetrics.map(([metric, definition]) => ({
        userId,
        title: definition.title,
        description: definition.description,
        icon: definition.icon,
        colorScheme: definition.colorScheme,
        category: definition.category,
        trackingType: HabitTrackingType.binary,
        targetPeriod: HabitTargetPeriod.daily,
        source: HabitSource.internal,
        internalMetric: metric as InternalHabitMetric,
        isActive: true,
        startDate: today,
        sortOrder: definition.sortOrder,
      })),
      skipDuplicates: true,
    })
  }
}

function assertTargetRules(data: {
  trackingType: HabitTrackingType
  targetPeriod: HabitTargetPeriod
  targetValue?: unknown
  unit?: string | null
}) {
  const requiresTarget = data.trackingType === HabitTrackingType.quantity
    || data.trackingType === HabitTrackingType.duration
    || data.trackingType === HabitTrackingType.count

  if (requiresTarget && data.targetValue == null) {
    throw new HttpError(
      400,
      'INVALID_HABIT_TARGET',
      'targetValue is required for quantity, duration, and count habits',
    )
  }

  const requiresUnit = data.trackingType === HabitTrackingType.quantity
    || data.trackingType === HabitTrackingType.duration

  if (requiresUnit && !data.unit) {
    throw new HttpError(
      400,
      'INVALID_HABIT_TARGET',
      'unit is required for quantity and duration habits',
    )
  }

  if (data.targetPeriod !== HabitTargetPeriod.daily && data.trackingType !== HabitTrackingType.count) {
    throw new HttpError(
      400,
      'INVALID_HABIT_TARGET',
      'weekly and monthly targets are only supported for count habits in this phase',
    )
  }
}

function assertDateRange(startDate: Date, endDate?: Date | null) {
  if (endDate && startDate > endDate) {
    throw new HttpError(400, 'INVALID_DATE_RANGE', 'startDate must be on or before endDate')
  }
}

function assertManualHabitMutation(source: HabitSource) {
  if (source === HabitSource.internal) {
    throw new HttpError(403, 'INTERNAL_HABIT_READONLY', 'Internal habits can only be enabled or disabled')
  }
}

export async function listHabits(app: FastifyInstance, userId: string) {
  await ensureInternalHabitRows(app, userId)

  return app.prisma.habit.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
    select: habitSelect,
  })
}

export async function listInternalHabits(app: FastifyInstance, userId: string) {
  await ensureInternalHabitRows(app, userId)

  return app.prisma.habit.findMany({
    where: {
      userId,
      source: HabitSource.internal,
      internalMetric: { not: null },
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
    select: habitSelect,
  })
}

export async function listTodayHabits(app: FastifyInstance, userId: string) {
  await ensureInternalHabitRows(app, userId)

  const preferences = await getUserDatePreferences(app, userId)
  const today = toDateOnly(getLocalDateKey(preferences.timezone))
  const habits = await app.prisma.habit.findMany({
    where: {
      userId,
      isActive: true,
      startDate: { lte: today },
      OR: [
        { endDate: null },
        { endDate: { gte: today } },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
    select: habitSelect,
  })

  return Promise.all(habits.map(async (habit) => {
    const period = getPeriodForDate(today, habit.targetPeriod, preferences.weekStartsOn)
    const logs = await app.prisma.habitLog.findMany({
      where: {
        habitId: habit.id,
        date: {
          gte: habit.startDate,
          lt: period.end,
        },
      },
      select: habitLogSelect,
      orderBy: { date: 'asc' },
    })
    const todayLog = logs.find(log => toDateKey(log.date) === toDateKey(today))
    const streakStats = calculateStreakStats(habit, logs, today, preferences.weekStartsOn)
    const todayValue = habit.targetPeriod === HabitTargetPeriod.daily
      ? todayLog?.value ?? null
      : sumLogValues(logs, period)

    return {
      ...habit,
      todayValue,
      completed: isPeriodCompleted(habit, logs, period),
      currentStreak: streakStats.currentStreak,
    }
  }))
}

export async function getHabit(app: FastifyInstance, userId: string, habitId: string) {
  const habit = await app.prisma.habit.findFirst({
    where: {
      id: habitId,
      userId,
    },
    select: habitSelect,
  })

  if (!habit) {
    throw new HttpError(404, 'NOT_FOUND', 'Habit not found')
  }

  return habit
}

export async function createHabit(app: FastifyInstance, userId: string, data: HabitCreateInput) {
  assertTargetRules(data)

  const startDate = toDateOnly(data.startDate)
  const endDate = data.endDate ? toDateOnly(data.endDate) : null
  assertDateRange(startDate, endDate)

  return app.prisma.habit.create({
    data: {
      ...data,
      userId,
      source: HabitLogSource.manual,
      targetValue: data.targetValue,
      startDate,
      endDate,
    },
    select: habitSelect,
  })
}

export async function updateHabit(app: FastifyInstance, userId: string, habitId: string, data: HabitUpdateInput) {
  const current = await getHabit(app, userId, habitId)
  assertManualHabitMutation(current.source)
  const next = {
    trackingType: data.trackingType ?? current.trackingType,
    targetPeriod: data.targetPeriod ?? current.targetPeriod,
    targetValue: data.targetValue === undefined ? current.targetValue : data.targetValue,
    unit: data.unit === undefined ? current.unit : data.unit,
    startDate: data.startDate ? toDateOnly(data.startDate) : current.startDate,
    endDate: data.endDate === undefined ? current.endDate : toNullableDateOnly(data.endDate),
  }

  assertTargetRules(next)
  assertDateRange(next.startDate, next.endDate)

  return app.prisma.habit.update({
    where: { id: habitId },
    data: {
      title: data.title,
      description: data.description,
      icon: data.icon,
      colorScheme: data.colorScheme,
      category: data.category,
      trackingType: data.trackingType,
      targetPeriod: data.targetPeriod,
      targetValue: toNullableTargetValue(data.targetValue),
      unit: data.unit,
      startDate: data.startDate ? toDateOnly(data.startDate) : undefined,
      endDate: toNullableDateOnly(data.endDate),
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    },
    select: habitSelect,
  })
}

export async function archiveHabit(app: FastifyInstance, userId: string, habitId: string) {
  await getHabit(app, userId, habitId)

  return app.prisma.$transaction(async (tx) => {
    await tx.habitReminder.updateMany({
      where: { habitId },
      data: {
        isEnabled: false,
        nextTriggerAt: null,
      },
    })

    return tx.habit.update({
      where: { id: habitId },
      data: { isActive: false },
      select: habitSelect,
    })
  })
}

export async function toggleInternalHabit(app: FastifyInstance, userId: string, metric: InternalHabitMetric, isActive: boolean) {
  await ensureInternalHabitRows(app, userId)

  const habit = await app.prisma.habit.findFirst({
    where: {
      userId,
      source: HabitSource.internal,
      internalMetric: metric,
    },
    select: { id: true },
  })

  if (!habit) {
    throw new HttpError(404, 'NOT_FOUND', 'Habit not found')
  }

  const updatedHabit = await app.prisma.$transaction(async (tx) => {
    if (!isActive) {
      await tx.habitReminder.updateMany({
        where: { habitId: habit.id },
        data: {
          isEnabled: false,
          nextTriggerAt: null,
        },
      })
    }

    return tx.habit.update({
      where: { id: habit.id },
      data: { isActive },
      select: habitSelect,
    })
  })

  if (isActive) {
    await backfillInternalHabitLogs(app, {
      userId,
      metrics: [metric],
      startDate: updatedHabit.startDate.toISOString().slice(0, 10),
    })
  }

  return updatedHabit
}

export async function getHabitStats(app: FastifyInstance, userId: string, habitId: string) {
  const [habit, preferences] = await Promise.all([
    getHabit(app, userId, habitId),
    getUserDatePreferences(app, userId),
  ])
  const today = toDateOnly(getLocalDateKey(preferences.timezone))
  const endDate = habit.endDate && habit.endDate < today ? habit.endDate : today
  const logs = await app.prisma.habitLog.findMany({
    where: {
      habitId,
      date: {
        gte: habit.startDate,
        lte: endDate,
      },
    },
    select: habitLogSelect,
    orderBy: { date: 'asc' },
  })
  const weekPeriod = getPeriodForDate(today, HabitTargetPeriod.weekly, preferences.weekStartsOn)
  const monthPeriod = getPeriodForDate(today, HabitTargetPeriod.monthly, preferences.weekStartsOn)
  const streakStats = calculateStreakStats(habit, logs, today, preferences.weekStartsOn)

  return {
    ...streakStats,
    streakPeriod: habit.targetPeriod,
    weeklyCompletion: calculateCompletionPercentage({
      habit,
      logs,
      period: weekPeriod,
      weekStartsOn: preferences.weekStartsOn,
      throughDate: today,
    }),
    monthlyCompletion: calculateCompletionPercentage({
      habit,
      logs,
      period: monthPeriod,
      weekStartsOn: preferences.weekStartsOn,
      throughDate: today,
    }),
  }
}
