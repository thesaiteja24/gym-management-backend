import type { UserMeasurement } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { MeasurementInput } from './me.schemas'
import { InternalHabitMetric, Prisma } from '@prisma/client'
import { CACHE_KEYS, CACHE_TTL } from '@/config/cache'
import { evictCache, getOrSetCache } from '@/services/cache.service'
import { HttpError } from '@/utils/response'
import { getLocalDateKeyForInstant, reconcileInternalHabitLogs } from '../habit/habit.internal.service'

/**
 * Normalizes values by converting decimal objects to numbers if needed.
 * @param val The value to normalize.
 * @returns The normalized value.
 */
function getNormalizedVal(val: unknown): unknown {
  if (val && typeof val === 'object' && 'toNumber' in val) {
    const convert = (val as { toNumber?: unknown }).toNumber
    if (typeof convert === 'function') {
      return convert.call(val)
    }
  }
  return val
}

interface LatestMetricsResult {
  weight: unknown
  waist: unknown
  bodyFat: unknown
  leanBodyMass: unknown
  neck: unknown
  shoulders: unknown
  chest: unknown
  abdomen: unknown
  hips: unknown
  leftBicep: unknown
  rightBicep: unknown
  leftForearm: unknown
  rightForearm: unknown
  leftThigh: unknown
  rightThigh: unknown
  leftCalf: unknown
  rightCalf: unknown
}

interface WeightEntry {
  weight: unknown
}

interface MeasurementsPayload {
  history: UserMeasurement[]
  latestValues: Record<string, unknown>
  dailyWeightChange: { diff: number, isPositive: boolean } | null
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function reconcileWeightLoggedHabit(app: FastifyInstance, userId: string, dates: Date[]) {
  if (dates.length === 0) {
    return
  }

  const user = await app.prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })

  if (!user) {
    return
  }

  await reconcileInternalHabitLogs(app, {
    userId,
    metric: InternalHabitMetric.weightLogged,
    localDates: dates.map(date => getLocalDateKeyForInstant(user.timezone, date)),
  })
}

/**
 * Fetches the latest non-null metrics using raw SQL.
 */
async function fetchLatestMetrics(app: FastifyInstance, userId: string): Promise<Record<string, unknown>> {
  const latestResult = await app.prisma.$queryRaw<LatestMetricsResult[]>`
    SELECT
      (SELECT weight FROM "UserMeasurement" WHERE "userId" = ${userId} AND weight IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as weight,
      (SELECT waist FROM "UserMeasurement" WHERE "userId" = ${userId} AND waist IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as waist,
      (SELECT "bodyFat" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "bodyFat" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "bodyFat",
      (SELECT "leanBodyMass" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "leanBodyMass" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "leanBodyMass",
      (SELECT neck FROM "UserMeasurement" WHERE "userId" = ${userId} AND neck IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as neck,
      (SELECT shoulders FROM "UserMeasurement" WHERE "userId" = ${userId} AND shoulders IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as shoulders,
      (SELECT chest FROM "UserMeasurement" WHERE "userId" = ${userId} AND chest IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as chest,
      (SELECT abdomen FROM "UserMeasurement" WHERE "userId" = ${userId} AND abdomen IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as abdomen,
      (SELECT hips FROM "UserMeasurement" WHERE "userId" = ${userId} AND hips IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as hips,
      (SELECT "leftBicep" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "leftBicep" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "leftBicep",
      (SELECT "rightBicep" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "rightBicep" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "rightBicep",
      (SELECT "leftForearm" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "leftForearm" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "leftForearm",
      (SELECT "rightForearm" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "rightForearm" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "rightForearm",
      (SELECT "leftThigh" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "leftThigh" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "leftThigh",
      (SELECT "rightThigh" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "rightThigh" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "rightThigh",
      (SELECT "leftCalf" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "leftCalf" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "leftCalf",
      (SELECT "rightCalf" FROM "UserMeasurement" WHERE "userId" = ${userId} AND "rightCalf" IS NOT NULL ORDER BY date DESC, "createdAt" DESC LIMIT 1) as "rightCalf";
  `

  const latestValues: Record<string, unknown> = {}
  const latest = latestResult[0]
  if (latest) {
    for (const key in latest) {
      const val = getNormalizedVal(latest[key as keyof LatestMetricsResult])
      if (val !== null && val !== undefined) {
        latestValues[key] = val
      }
    }
  }
  return latestValues
}

/**
 * Calculates daily weight change from 2 most recent weight logs.
 */
async function fetchDailyWeightChange(app: FastifyInstance, userId: string): Promise<{ diff: number, isPositive: boolean } | null> {
  const weightLogs = await app.prisma.$queryRaw<WeightEntry[]>`
    SELECT weight
    FROM "UserMeasurement"
    WHERE "userId" = ${userId} AND weight IS NOT NULL
    ORDER BY date DESC, "createdAt" DESC
    LIMIT 2
  `

  if (weightLogs.length >= 2) {
    const latestWeight = Number(getNormalizedVal(weightLogs[0]!.weight))
    const previousWeight = Number(getNormalizedVal(weightLogs[1]!.weight))
    return {
      diff: Math.abs(latestWeight - previousWeight),
      isPositive: latestWeight > previousWeight,
    }
  }
  return null
}

/**
 * Retrieves all user measurement entries.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param startDate Start date of range queries.
 * @returns History arrays, latest values, and weight delta.
 */
export async function queryMeasurements(app: FastifyInstance, userId: string, startDate?: Date | null) {
  const cacheKey = CACHE_KEYS.measurements(userId)

  const payload = await getOrSetCache<MeasurementsPayload>(app.redis, cacheKey, CACHE_TTL.day, async () => {
    const history = await app.prisma.userMeasurement.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    })

    const [latestValues, dailyWeightChange] = await Promise.all([
      fetchLatestMetrics(app, userId),
      fetchDailyWeightChange(app, userId),
    ])

    return {
      history,
      latestValues,
      dailyWeightChange,
    }
  })

  // Filter in-memory if startDate is provided
  if (startDate) {
    const filteredHistory = payload.history.filter(m => new Date(m.date) >= startDate)
    return {
      ...payload,
      history: filteredHistory,
    }
  }

  return payload
}

/**
 * Creates a new daily body measurement entry for a given date.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param data The measurement metrics and date.
 * @returns The created measurement record.
 * @throws HttpError 409 if a measurement already exists for this date.
 */
export async function createMeasurement(app: FastifyInstance, userId: string, data: MeasurementInput) {
  const { date, ...metrics } = data

  const entryDate = new Date(date)

  const existing = await app.prisma.userMeasurement.findUnique({
    where: { userId_date: { userId, date: entryDate } },
  })

  if (existing) {
    throw new HttpError(409, 'CONFLICT', 'Measurement already exists for this date')
  }

  let measurement
  try {
    measurement = await app.prisma.userMeasurement.create({
      data: { ...metrics, userId, date: entryDate },
    })
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, 'CONFLICT', 'Measurement already exists for this date')
    }
    throw error
  }

  // Evict cache on write
  await evictCache(app, CACHE_KEYS.measurements(userId))
  if (measurement.weight !== null) {
    await reconcileWeightLoggedHabit(app, userId, [measurement.date])
  }

  return measurement
}

/**
 * Updates a specific body measurement entry by its ID.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param id The ID of the measurement to update.
 * @param data The measurement fields to update.
 * @returns Formatted updated measurement record.
 * @throws HttpError 404 if the measurement is not found.
 * @throws HttpError 401 if the measurement belongs to another user.
 */
export async function updateMeasurement(
  app: FastifyInstance,
  userId: string,
  id: string,
  data: MeasurementInput,
) {
  const measurement = await app.prisma.userMeasurement.findUnique({
    where: { id },
  })

  if (!measurement) {
    throw new HttpError(404, 'NOT_FOUND', 'Measurement not found')
  }

  if (measurement.userId !== userId) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized access to measurement')
  }

  const { date, ...metrics } = data

  const updateData: Record<string, unknown> = { ...metrics }
  if (date) {
    updateData.date = new Date(date)
  }

  let updated
  try {
    updated = await app.prisma.userMeasurement.update({
      where: { id },
      data: updateData,
    })
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, 'CONFLICT', 'Measurement already exists for this date')
    }
    throw error
  }

  // Evict cache on update
  await evictCache(app, CACHE_KEYS.measurements(userId))
  const datesToReconcile: Date[] = []
  if (measurement.weight !== null) {
    datesToReconcile.push(measurement.date)
  }
  if (updated.weight !== null) {
    datesToReconcile.push(updated.date)
  }
  await reconcileWeightLoggedHabit(app, userId, datesToReconcile)

  return updated
}

/**
 * Deletes a specific body measurement entry by its ID.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param id The ID of the measurement to delete.
 * @throws HttpError 404 if the measurement is not found.
 * @throws HttpError 401 if the measurement belongs to another user.
 */
export async function deleteMeasurement(
  app: FastifyInstance,
  userId: string,
  id: string,
) {
  const measurement = await app.prisma.userMeasurement.findUnique({
    where: { id },
  })

  if (!measurement) {
    throw new HttpError(404, 'NOT_FOUND', 'Measurement not found')
  }

  if (measurement.userId !== userId) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized access to measurement')
  }

  await app.prisma.userMeasurement.delete({
    where: { id },
  })

  // Evict cache on delete
  await evictCache(app, CACHE_KEYS.measurements(userId))
  if (measurement.weight !== null) {
    await reconcileWeightLoggedHabit(app, userId, [measurement.date])
  }
}
