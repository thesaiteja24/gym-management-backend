import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { ApiError } from '../../utils/ApiError.js'

export {
  formatFitnessProfile,
  formatMeasurementEntry,
  formatNutritionPlan,
  formatSelfUser,
} from './me.formatters.js'

import {
  formatFitnessProfile,
  formatMeasurementEntry,
  formatNutritionPlan,
  formatSelfUser,
} from './me.formatters.js'
import type { SelfUser, UpdateProfileBody } from './me.types.js'
import {
  calculateStreak,
  calculateWeeklyMetrics,
  calculateWeightChange,
  extractLatestValues,
} from './me.utils.js'

// CONSTANTS
const prisma = new PrismaClient().$extends(withAccelerate())

// QUERY HELPERS

export const selfUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
  followersCount: true,
  followingCount: true,
  isPro: true,
  proSubscriptionType: true,
  email: true,
  countryCode: true,
  phone: true,
  height: true,
  weight: true,
  preferredLengthUnit: true,
  preferredWeightUnit: true,
  dateOfBirth: true,
  gender: true,
  role: true,
  privacyPolicyAcceptedAt: true,
  privacyPolicyVersion: true,
  phoneE164: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      workoutLogs: { where: { deletedAt: null } },
    },
  },
}

/**
 * Helper to parse duration string (e.g. '1w', '1m') to a start date.
 */
export function parseDurationToStartDate(duration: string): Date | null {
  const norm = duration.toLowerCase()
  if (norm === 'all') return null

  const now = new Date()
  const start = new Date(now)

  if (norm === '1w') {
    start.setDate(start.getDate() - 7)
    return start
  }

  const unit = norm.slice(-1)
  const val = parseInt(norm.slice(0, -1)) || 0

  if (unit === 'd') {
    start.setDate(start.getDate() - val)
  } else if (unit === 'm') {
    start.setMonth(start.getMonth() - val)
  } else if (unit === 'y') {
    start.setFullYear(start.getFullYear() - val)
  } else {
    start.setMonth(start.getMonth() - 1)
  }

  return start
}

// FUNCTIONS

/**
 * Fetch the authenticated user's profile.
 */
export async function getOwnProfile(userId: string): Promise<SelfUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: selfUserSelect,
  })
  if (!user) throw new ApiError(404, 'User not found')
  return formatSelfUser(user)
}

/**
 * Update the authenticated user's profile.
 */
export async function updateOwnProfile(userId: string, data: UpdateProfileBody): Promise<SelfUser> {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...data,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      preferredLengthUnit: data.preferredLengthUnit,
      preferredWeightUnit: data.preferredWeightUnit,
      gender: data.gender,
    },
    select: selfUserSelect,
  })
  return formatSelfUser(updatedUser)
}

/**
 * Fetch the authenticated user's fitness profile.
 */
export async function getFitnessProfile(userId: string) {
  const [profile, nutritionPlan] = await Promise.all([
    prisma.userFitnessProfile.findUnique({
      where: { userId },
    }),
    prisma.userNutritionPlan.findUnique({
      where: { userId },
    }),
  ])

  if (!profile) return null

  return {
    ...formatFitnessProfile(profile),
    nutritionPlan: nutritionPlan ? formatNutritionPlan(nutritionPlan) : null,
  }
}

/**
 * Update the authenticated user's fitness profile.
 */
export async function updateFitnessProfile(userId: string, data: Record<string, unknown>) {
  const { nutritionPlan, ...profileData } = data

  const profile = await prisma.userFitnessProfile.upsert({
    where: { userId },
    create: {
      ...profileData,
      userId,
      targetDate:
        typeof profileData.targetDate === 'string' ? new Date(profileData.targetDate) : undefined,
    } as any,
    update: {
      ...profileData,
      targetDate:
        typeof profileData.targetDate === 'string' ? new Date(profileData.targetDate) : undefined,
    } as any,
  })

  if (nutritionPlan) {
    await updateNutritionPlan(userId, nutritionPlan as Record<string, unknown>)
  }

  return formatFitnessProfile(profile)
}

/**
 * Fetch the authenticated user's nutrition plan.
 */
export async function getNutritionPlan(userId: string) {
  const plan = await prisma.userNutritionPlan.findUnique({
    where: { userId },
  })
  return plan ? formatNutritionPlan(plan) : null
}

/**
 * Update the authenticated user's nutrition plan.
 */
export async function updateNutritionPlan(userId: string, data: Record<string, unknown>) {
  const plan = await prisma.userNutritionPlan.upsert({
    where: { userId },
    create: {
      ...data,
      userId,
      startDate: typeof data.startDate === 'string' ? new Date(data.startDate) : new Date(),
    } as any,
    update: {
      ...data,
      startDate: typeof data.startDate === 'string' ? new Date(data.startDate) : undefined,
    } as any,
  })
  return formatNutritionPlan(plan)
}

/**
 * Build measurement history and tracking payload.
 */
export async function buildMeasurementPayload(userId: string, startDate?: Date | null) {
  const measurementsHistory = await prisma.userMeasurement.findMany({
    where: {
      userId,
      ...(startDate ? { date: { gte: startDate } } : {}),
    },
    orderBy: { date: 'desc' },
  })

  const formattedHistory = measurementsHistory.map(formatMeasurementEntry)
  const latestValues = extractLatestValues(formattedHistory)
  const dailyWeightChange = calculateWeightChange(formattedHistory)

  return { history: formattedHistory, latestValues, dailyWeightChange }
}

/**
 * Add or update daily measurements.
 */
export async function processMeasurements(userId: string, data: Record<string, unknown>) {
  const { date, ...metrics } = data
  if (typeof date !== 'string') throw new ApiError(400, 'Invalid date')

  const entryDate = new Date(date)
  entryDate.setUTCHours(0, 0, 0, 0)

  const measurement = await prisma.userMeasurement.upsert({
    where: {
      userId_date: { userId, date: entryDate },
    },
    create: {
      ...metrics,
      userId,
      date: entryDate,
    } as any,
    update: {
      ...metrics,
    } as any,
  })

  return measurement
}

/**
 * Get user analytics including streaks, volume, and frequency.
 */
export async function getUserAnalytics(userId: string) {
  const workoutLogs = await prisma.workoutLog.findMany({
    where: { userId, deletedAt: null },
    include: {
      exercises: {
        include: {
          exercise: { select: { exerciseType: true } },
          sets: true,
        },
      },
    },
    orderBy: { startTime: 'desc' },
  })

  const toDateKey = (date: Date) => date.toISOString().split('T')[0]
  const workoutDates = new Set(
    workoutLogs
      .filter((w) => w.startTime)
      .map((w) => toDateKey(new Date(w.startTime as Date))),
  )

  const today = new Date()
  const currentWeekStart = new Date(today)
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  currentWeekStart.setDate(diff)
  currentWeekStart.setHours(0, 0, 0, 0)
  const lastWeekStart = new Date(currentWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)

  const metrics = calculateWeeklyMetrics(workoutLogs, currentWeekStart, lastWeekStart)

  const lastWorkoutDate =
    workoutLogs.length > 0 && workoutLogs[0].startTime ? new Date(workoutLogs[0].startTime) : null
  const daysSinceLastWorkout = lastWorkoutDate
    ? Math.floor((today.getTime() - lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0

  return {
    ...metrics,
    streakDays: calculateStreak(workoutDates),
    daysSinceLastWorkout,
    workoutDates: Array.from(workoutDates),
  }
}
