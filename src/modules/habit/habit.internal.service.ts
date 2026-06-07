import type { FastifyInstance } from 'fastify'
import { HabitLogSource, HabitSource, InternalHabitMetric } from '@prisma/client'

interface ReconcileInternalHabitLogsInput {
  userId: string
  metric: InternalHabitMetric
  localDates: string[]
}

interface TimeZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

interface LocalDateParts {
  year: number
  month: number
  day: number
}

function toDateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

function parseLocalDate(localDate: string): LocalDateParts {
  const [year, month, day] = localDate.split('-').map(Number)
  if (!year || !month || !day) {
    throw new Error(`Invalid local date: ${localDate}`)
  }

  return { year, month, day }
}

function getTimeZoneParts(timezone: string, date: Date): TimeZoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

export function getLocalDateKeyForInstant(timezone: string, date: Date) {
  const parts = getTimeZoneParts(timezone, date)
  return [
    parts.year.toString().padStart(4, '0'),
    parts.month.toString().padStart(2, '0'),
    parts.day.toString().padStart(2, '0'),
  ].join('-')
}

function getUtcInstantForLocalTime(timezone: string, localDate: string) {
  const { year, month, day } = parseLocalDate(localDate)
  const expectedUtc = Date.UTC(year, month - 1, day)
  let utcMs = expectedUtc

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getTimeZoneParts(timezone, new Date(utcMs))
    const actualUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    utcMs -= actualUtc - expectedUtc
  }

  return new Date(utcMs)
}

function getUtcRangeForLocalDate(timezone: string, localDate: string) {
  const { year, month, day } = parseLocalDate(localDate)
  const nextLocalDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)

  return {
    start: getUtcInstantForLocalTime(timezone, localDate),
    end: getUtcInstantForLocalTime(timezone, nextLocalDate),
  }
}

async function countWeightMeasurements(app: FastifyInstance, userId: string, timezone: string, localDate: string) {
  const range = getUtcRangeForLocalDate(timezone, localDate)

  return app.prisma.userMeasurement.count({
    where: {
      userId,
      weight: { not: null },
      date: {
        gte: range.start,
        lt: range.end,
      },
    },
  })
}

async function countWorkoutLogs(app: FastifyInstance, userId: string, timezone: string, localDate: string) {
  const range = getUtcRangeForLocalDate(timezone, localDate)

  return app.prisma.workoutLog.count({
    where: {
      userId,
      deletedAt: null,
      startTime: {
        gte: range.start,
        lt: range.end,
      },
    },
  })
}

async function countCompletedProgramDays(app: FastifyInstance, userId: string, timezone: string, localDate: string) {
  const range = getUtcRangeForLocalDate(timezone, localDate)

  return app.prisma.userProgramDay.count({
    where: {
      completed: true,
      completedAt: {
        gte: range.start,
        lt: range.end,
      },
      week: {
        userProgram: {
          userId,
        },
      },
    },
  })
}

async function getSourceCount(app: FastifyInstance, input: {
  userId: string
  timezone: string
  metric: InternalHabitMetric
  localDate: string
}) {
  if (input.metric === InternalHabitMetric.workoutCompleted) {
    return countWorkoutLogs(app, input.userId, input.timezone, input.localDate)
  }

  if (input.metric === InternalHabitMetric.programDayCompleted) {
    return countCompletedProgramDays(app, input.userId, input.timezone, input.localDate)
  }

  if (input.metric === InternalHabitMetric.weightLogged) {
    return countWeightMeasurements(app, input.userId, input.timezone, input.localDate)
  }

  return 0
}

async function getInternalHabitsForMetric(app: FastifyInstance, input: {
  userId: string
  metric: InternalHabitMetric
}) {
  return app.prisma.habit.findMany({
    where: {
      userId: input.userId,
      isActive: true,
      source: HabitSource.internal,
      internalMetric: input.metric,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  })
}

async function projectInternalHabitLog(app: FastifyInstance, input: {
  habitId: string
  date: Date
  sourceCount: number
}) {
  if (input.sourceCount === 0) {
    await app.prisma.habitLog.deleteMany({
      where: {
        habitId: input.habitId,
        date: input.date,
        source: HabitLogSource.internal,
      },
    })
    return
  }

  await app.prisma.habitLog.upsert({
    where: {
      habitId_date: {
        habitId: input.habitId,
        date: input.date,
      },
    },
    create: {
      habitId: input.habitId,
      date: input.date,
      value: input.sourceCount,
      completed: true,
      source: HabitLogSource.internal,
    },
    update: {
      value: input.sourceCount,
      completed: true,
      source: HabitLogSource.internal,
    },
  })
}

export async function reconcileInternalHabitLogs(app: FastifyInstance, input: ReconcileInternalHabitLogsInput) {
  const localDates = [...new Set(input.localDates)].sort()
  if (localDates.length === 0) {
    return
  }

  const user = await app.prisma.user.findUnique({
    where: { id: input.userId },
    select: { timezone: true },
  })

  if (!user) {
    return
  }

  const habits = await getInternalHabitsForMetric(app, {
    userId: input.userId,
    metric: input.metric,
  })

  for (const localDate of localDates) {
    const date = toDateOnly(localDate)
    const sourceCount = await getSourceCount(app, {
      userId: input.userId,
      timezone: user.timezone,
      metric: input.metric,
      localDate,
    })

    for (const habit of habits) {
      if (habit.startDate > date || (habit.endDate && habit.endDate < date)) {
        continue
      }

      await projectInternalHabitLog(app, {
        habitId: habit.id,
        date,
        sourceCount,
      })
    }
  }
}
