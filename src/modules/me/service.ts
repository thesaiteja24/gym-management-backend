import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { ApiError } from '../../utils/ApiError.js'
import type { SelfUser, UpdateProfileBody } from './types.js'

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
export async function updateFitnessProfile(userId: string, data: any) {
  const { nutritionPlan, ...profileData } = data

  const profile = await prisma.userFitnessProfile.upsert({
    where: { userId },
    create: {
      ...profileData,
      userId,
      targetDate: profileData.targetDate ? new Date(profileData.targetDate) : undefined,
    },
    update: {
      ...profileData,
      targetDate: profileData.targetDate ? new Date(profileData.targetDate) : undefined,
    },
  })

  if (nutritionPlan) {
    await updateNutritionPlan(userId, nutritionPlan)
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
export async function updateNutritionPlan(userId: string, data: any) {
  const plan = await prisma.userNutritionPlan.upsert({
    where: { userId },
    create: {
      ...data,
      userId,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
    },
    update: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
    },
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

  const latestValues: any = {}
  let latestWeight: number | null = null
  let previousWeight: number | null = null

  const formattedHistory = measurementsHistory.map((entry) => {
    const { userId: _, createdAt: __, updatedAt: ___, ...rest } = entry
    const formatted: any = { ...rest }

    for (const key in formatted) {
      if (key !== 'id' && key !== 'date' && key !== 'progressPicUrls') {
        const val = formatted[key]
        formatted[key] = val !== null ? Number(val) : null
      }
    }

    for (const key in formatted) {
      if (key === 'id' || key === 'date') continue
      if (latestValues[key] === undefined && formatted[key] !== null) {
        latestValues[key] = formatted[key]
      }
    }

    if (entry.weight !== null) {
      const weight = Number(entry.weight)
      if (latestWeight === null) latestWeight = weight
      else if (previousWeight === null) previousWeight = weight
    }

    return formatted
  })

  let dailyWeightChange: any = null
  if (latestWeight !== null && previousWeight !== null) {
    dailyWeightChange = {
      diff: Math.abs(latestWeight - previousWeight),
      isPositive: latestWeight > previousWeight,
    }
  }

  return { history: formattedHistory, latestValues, dailyWeightChange }
}

/**
 * Add or update daily measurements.
 */
export async function processMeasurements(userId: string, data: any) {
  const { date, ...metrics } = data
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
    },
    update: {
      ...metrics,
    },
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

  const today = new Date()
  const toDateKey = (date: Date) => date.toISOString().split('T')[0]
  const workoutDates = new Set(
    workoutLogs.filter((w) => w.startTime).map((w) => toDateKey(new Date(w.startTime!))),
  )

  let currentStreak = 0
  const streakCursor = new Date(today)
  if (!workoutDates.has(toDateKey(today))) {
    streakCursor.setDate(streakCursor.getDate() - 1)
  }
  while (workoutDates.has(toDateKey(streakCursor))) {
    currentStreak++
    streakCursor.setDate(streakCursor.getDate() - 1)
  }

  const currentWeekStart = new Date(today)
  currentWeekStart.setDate(today.getDate() - today.getDay())
  currentWeekStart.setHours(0, 0, 0, 0)
  const lastWeekStart = new Date(currentWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)

  const metrics = {
    workoutsThisWeek: 0,
    weeklyVolume: 0,
    lastWeekVolume: 0,
    weeklyDuration: 0,
    lastWeekDuration: 0,
    weeklyReps: 0,
    lastWeekReps: 0,
  }

  workoutLogs.forEach((w) => {
    if (!w.startTime) return
    const wDate = new Date(w.startTime)
    const isThisWeek = wDate >= currentWeekStart
    const isLastWeek = wDate >= lastWeekStart && wDate < currentWeekStart
    if (!isThisWeek && !isLastWeek) return

    if (isThisWeek) metrics.workoutsThisWeek++

    let workoutVolume = 0,
      workoutReps = 0,
      workoutDuration = 0
    if (w.startTime && w.endTime) {
      workoutDuration = Math.floor(
        (new Date(w.endTime).getTime() - new Date(w.startTime).getTime()) / 1000,
      )
    }

    w.exercises.forEach((ex) => {
      ex.sets.forEach((set) => {
        if (ex.exercise.exerciseType === 'weighted' || ex.exercise.exerciseType === 'assisted') {
          workoutVolume += (Number(set.weight) || 0) * (set.reps || 0)
        }
        workoutReps += set.reps || 0
      })
    })

    if (isThisWeek) {
      metrics.weeklyVolume += workoutVolume
      metrics.weeklyDuration += workoutDuration
      metrics.weeklyReps += workoutReps
    } else {
      metrics.lastWeekVolume += workoutVolume
      metrics.lastWeekDuration += workoutDuration
      metrics.lastWeekReps += workoutReps
    }
  })

  const lastWorkoutDate =
    workoutLogs.length > 0 && workoutLogs[0].startTime ? new Date(workoutLogs[0].startTime) : null
  const daysSinceLastWorkout = lastWorkoutDate
    ? Math.floor((today.getTime() - lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0

  return {
    ...metrics,
    streakDays: currentStreak,
    daysSinceLastWorkout,
    workoutDates: Array.from(workoutDates),
  }
}

/**
 * Get detailed training analytics (volume, reps, frequency over time).
 */
export async function getTrainingAnalytics(userId: string, startDate: Date | null) {
  const workoutLogs = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(startDate ? { startTime: { gte: startDate } } : {}),
    },
    include: {
      exercises: {
        include: {
          exercise: { select: { exerciseType: true } },
          sets: true,
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  // Group by date and calculate volume/reps/duration
  const analytics: Record<string, any> = {}

  workoutLogs.forEach((w) => {
    if (!w.startTime) return
    const dateKey = w.startTime.toISOString().split('T')[0]
    if (!analytics[dateKey]) {
      analytics[dateKey] = { volume: 0, reps: 0, duration: 0, workouts: 0 }
    }

    analytics[dateKey].workouts++
    if (w.startTime && w.endTime) {
      analytics[dateKey].duration += Math.floor(
        (new Date(w.endTime).getTime() - new Date(w.startTime).getTime()) / 1000,
      )
    }

    w.exercises.forEach((ex) => {
      ex.sets.forEach((set) => {
        if (ex.exercise.exerciseType === 'weighted' || ex.exercise.exerciseType === 'assisted') {
          analytics[dateKey].volume += (Number(set.weight) || 0) * (set.reps || 0)
        }
        analytics[dateKey].reps += set.reps || 0
      })
    })
  })

  return analytics
}

/**
 * Get strength trend (Estimated 1RM) for top exercises.
 */
export async function getStrengthTrend(
  userId: string,
  startDate: Date | null,
  top: number | 'all',
) {
  const exerciseSets = await prisma.workoutLogExerciseSet.findMany({
    where: {
      workoutExercise: {
        workout: {
          userId,
          deletedAt: null,
          ...(startDate ? { startTime: { gte: startDate } } : {}),
        },
        exercise: {
          exerciseType: { in: ['weighted', 'assisted'] },
        },
      },
    },
    include: {
      workoutExercise: {
        include: {
          exercise: { select: { id: true, title: true } },
          workout: { select: { startTime: true } },
        },
      },
    },
    orderBy: { workoutExercise: { workout: { startTime: 'asc' } } },
  })

  const trends: Record<string, any> = {}

  exerciseSets.forEach((set: any) => {
    const ex = set.workoutExercise.exercise
    const startTime = set.workoutExercise.workout.startTime
    if (!startTime) return

    if (!trends[ex.id]) {
      trends[ex.id] = { title: ex.title, history: [] }
    }

    const weight = Number(set.weight) || 0
    const reps = set.reps || 0
    if (weight <= 0 || reps <= 0) return

    const estimated1RM = weight * (1 + reps / 30) // Epley formula
    const date = startTime.toISOString().split('T')[0]

    // Keep only the best 1RM per day for each exercise
    const existing = trends[ex.id].history.find((h: any) => h.date === date)
    if (existing) {
      if (estimated1RM > existing.estimated1RM) {
        existing.estimated1RM = estimated1RM
      }
    } else {
      trends[ex.id].history.push({ date, estimated1RM })
    }
  })

  let result = Object.values(trends)
  if (top !== 'all') {
    // Sort by recent activity or volume? Let's just take top N by number of entries
    result.sort((a: any, b: any) => b.history.length - a.history.length)
    result = result.slice(0, top as number)
  }

  return result
}

// OTHER HELPERS

/**
 * Formats a raw user object from Prisma into a SelfUser response.
 */
export function formatSelfUser(user: any): SelfUser {
  if (!user) return null as any
  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    profilePicUrl: user.profilePicUrl ?? null,
    followersCount: user.followersCount ?? 0,
    followingCount: user.followingCount ?? 0,
    isPro: user.isPro ?? false,
    proSubscriptionType: user.proSubscriptionType ?? null,
    email: user.email ?? null,
    countryCode: user.countryCode ?? null,
    phone: user.phone ?? null,
    height: user.height?.toNumber?.() ?? user.height ?? null,
    weight: user.weight?.toNumber?.() ?? user.weight ?? null,
    preferredLengthUnit: user.preferredLengthUnit ?? null,
    preferredWeightUnit: user.preferredWeightUnit ?? null,
    dateOfBirth: user.dateOfBirth?.toISOString?.() ?? user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    role: user.role,
    privacyPolicyAcceptedAt:
      user.privacyPolicyAcceptedAt?.toISOString?.() ?? user.privacyPolicyAcceptedAt ?? null,
    privacyPolicyVersion: user.privacyPolicyVersion ?? null,
    phoneE164: user.phoneE164 ?? null,
    createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
    updatedAt: user.updatedAt?.toISOString?.() ?? user.updatedAt,
  }
}

function formatFitnessProfile(profile: any) {
  return {
    ...profile,
    targetWeight: profile.targetWeight?.toNumber?.() ?? profile.targetWeight ?? null,
    targetBodyFat: profile.targetBodyFat?.toNumber?.() ?? profile.targetBodyFat ?? null,
    weeklyWeightChange:
      profile.weeklyWeightChange?.toNumber?.() ?? profile.weeklyWeightChange ?? null,
    nutritionPlan: profile.nutritionPlan ? formatNutritionPlan(profile.nutritionPlan) : null,
  }
}

function formatNutritionPlan(plan: any) {
  return {
    ...plan,
  }
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
