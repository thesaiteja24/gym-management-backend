import type { InternalHabitMetric } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { HabitSource } from '@prisma/client'
import { getLocalDateKeyForInstant, reconcileInternalHabitLogs } from './habit.internal.service'

interface BackfillInternalHabitLogsInput {
  userId?: string
  metrics?: InternalHabitMetric[]
  startDate?: string
  endDate?: string
}

function addLocalDays(localDate: string, days: number) {
  const [year, month, day] = localDate.split('-').map(Number)
  if (!year || !month || !day) {
    throw new Error(`Invalid local date: ${localDate}`)
  }

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function buildLocalDateRange(startDate: string, endDate: string) {
  const dates: string[] = []
  let cursor = startDate

  while (cursor <= endDate) {
    dates.push(cursor)
    cursor = addLocalDays(cursor, 1)
  }

  return dates
}

async function getBackfillTargets(app: FastifyInstance, input: BackfillInternalHabitLogsInput) {
  return app.prisma.habit.findMany({
    where: {
      ...(input.userId ? { userId: input.userId } : {}),
      isActive: true,
      source: HabitSource.internal,
      internalMetric: input.metrics?.length ? { in: input.metrics } : { not: null },
    },
    distinct: ['userId', 'internalMetric'],
    select: {
      userId: true,
      internalMetric: true,
    },
  })
}

async function getBackfillStartDate(app: FastifyInstance, input: {
  userId: string
  metric: InternalHabitMetric
  requestedStartDate?: string
}) {
  if (input.requestedStartDate) {
    return input.requestedStartDate
  }

  const firstHabit = await app.prisma.habit.findFirst({
    where: {
      userId: input.userId,
      isActive: true,
      source: HabitSource.internal,
      internalMetric: input.metric,
    },
    orderBy: { startDate: 'asc' },
    select: { startDate: true },
  })

  return firstHabit?.startDate.toISOString().slice(0, 10)
}

export async function backfillInternalHabitLogs(app: FastifyInstance, input: BackfillInternalHabitLogsInput = {}) {
  const targets = await getBackfillTargets(app, input)
  let reconciled = 0

  for (const target of targets) {
    if (!target.internalMetric) {
      continue
    }

    const user = await app.prisma.user.findUnique({
      where: { id: target.userId },
      select: { timezone: true },
    })

    if (!user) {
      continue
    }

    const startDate = await getBackfillStartDate(app, {
      userId: target.userId,
      metric: target.internalMetric,
      requestedStartDate: input.startDate,
    })
    const endDate = input.endDate ?? getLocalDateKeyForInstant(user.timezone, new Date())

    if (!startDate || startDate > endDate) {
      continue
    }

    const localDates = buildLocalDateRange(startDate, endDate)
    await reconcileInternalHabitLogs(app, {
      userId: target.userId,
      metric: target.internalMetric,
      localDates,
    })
    reconciled += localDates.length
  }

  return {
    targets: targets.length,
    reconciledDates: reconciled,
  }
}
