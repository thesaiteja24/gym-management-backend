import type { FastifyInstance } from 'fastify'
import type { HabitLogUpsertInput } from './habit.schema'
import { HabitLogSource, HabitSource, HabitTargetPeriod, HabitTrackingType, Prisma } from '@prisma/client'
import { HttpError } from '@/utils/response'
import { getHabit, habitLogSelect, toDateOnly } from './habit.service'

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

export async function listHabitLogs(app: FastifyInstance, input: {
  userId: string
  habitId: string
  startDate?: string
  endDate?: string
}) {
  const habit = await getHabit(app, input.userId, input.habitId)
  const startDate = input.startDate ? toDateOnly(input.startDate) : habit.startDate
  const endDate = input.endDate ? toDateOnly(input.endDate) : (habit.endDate ?? new Date())

  if (startDate > endDate) {
    throw new HttpError(400, 'INVALID_DATE_RANGE', 'startDate must be on or before endDate')
  }

  return app.prisma.habitLog.findMany({
    where: {
      habitId: input.habitId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
    select: habitLogSelect,
  })
}
