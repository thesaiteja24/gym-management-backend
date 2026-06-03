import type { FastifyInstance } from 'fastify'
import type {
  HabitCreateInput,
  HabitLogUpsertInput,
  HabitUpdateInput,
} from './habit.schema'
import { HabitLogSource, HabitSource, HabitTargetPeriod, HabitTrackingType, Prisma } from '@prisma/client'
import { HttpError } from '@/utils/response'

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

const habitLogSelect = {
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

function toDateOnly(date: string) {
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

function calculateDailyCompletion(
  habit: {
    trackingType: HabitTrackingType
    targetPeriod: HabitTargetPeriod
    targetValue: unknown
  },
  input: HabitLogUpsertInput,
) {
  if (habit.targetPeriod !== HabitTargetPeriod.daily) {
    return false
  }

  if (habit.trackingType === HabitTrackingType.binary) {
    return input.completed === true
  }

  const value = input.value ?? 0
  const targetValue = Number(habit.targetValue ?? 0)
  return value >= targetValue
}

function toJsonInput(value: HabitLogUpsertInput['metadata']): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === null) {
    return Prisma.JsonNull
  }

  return value as Prisma.InputJsonValue | undefined
}

export async function listHabits(app: FastifyInstance, userId: string) {
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

  return app.prisma.habit.update({
    where: { id: habitId },
    data: { isActive: false },
    select: habitSelect,
  })
}

export async function upsertHabitLog(app: FastifyInstance, input: {
  userId: string
  habitId: string
  date: string
  data: HabitLogUpsertInput
}) {
  const { userId, habitId, date, data } = input
  const habit = await getHabit(app, userId, habitId)

  if (habit.source === HabitSource.internal) {
    throw new HttpError(403, 'INTERNAL_HABIT_LOG_READONLY', 'Internal habit logs cannot be edited manually')
  }

  if (habit.trackingType === HabitTrackingType.binary && data.completed === undefined) {
    throw new HttpError(400, 'INVALID_HABIT_LOG', 'completed is required for binary habits')
  }

  if (habit.trackingType !== HabitTrackingType.binary && data.value === undefined) {
    throw new HttpError(400, 'INVALID_HABIT_LOG', 'value is required for this habit tracking type')
  }

  const completed = calculateDailyCompletion(habit, data)
  const logDate = toDateOnly(date)

  return app.prisma.habitLog.upsert({
    where: {
      habitId_date: {
        habitId,
        date: logDate,
      },
    },
    create: {
      habitId,
      date: logDate,
      value: data.value,
      completed,
      source: HabitLogSource.manual,
      note: data.note,
      metadata: toJsonInput(data.metadata),
    },
    update: {
      value: data.value,
      completed,
      source: HabitLogSource.manual,
      note: data.note,
      metadata: toJsonInput(data.metadata),
    },
    select: habitLogSelect,
  })
}

export async function deleteHabitLog(app: FastifyInstance, userId: string, habitId: string, date: string) {
  const habit = await getHabit(app, userId, habitId)

  if (habit.source === HabitSource.internal) {
    throw new HttpError(403, 'INTERNAL_HABIT_LOG_READONLY', 'Internal habit logs cannot be edited manually')
  }

  await app.prisma.habitLog.deleteMany({
    where: {
      habitId,
      date: toDateOnly(date),
    },
  })

  return null
}
