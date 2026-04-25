import { randomUUID } from 'crypto'

import type {
  ActivityLevel,
  EquipmentType,
  FitnessGoal,
  FitnessLevel,
  Gender,
  TargetType,
  UserMeasurement,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import type { UploadedFile } from '../../common/services/media.service.js'
import {
  deleteMediaByKey,
  deleteProfilePicture,
  extractS3KeyFromUrl,
  uploadMedia,
  uploadProfilePicture,
  uploadVideo,
} from '../../common/services/media.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logError, logWarn } from '../../common/utils/logger.js'
import { selfUserSelect, formatUserResponse } from '../user/user.controller.js'

const prisma = new PrismaClient().$extends(withAccelerate())

// types
interface UpdateMeBody {
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  preferredWeightUnit?: 'kg' | 'lbs'
  preferredLengthUnit?: 'cm' | 'inches'
  height?: number
  weight?: number
  gender?: Gender
}

type StrengthTrendDirection = 'up' | 'down' | 'flat'

interface getFitnessProfileBody {
  fitnessGoal?: FitnessGoal
  fitnessLevel?: FitnessLevel
  activityLevel?: ActivityLevel
  targetType?: TargetType
  targetWeight?: number
  targetBodyFat?: number
  weeklyWeightChange?: number
  targetDate?: string
  injuries?: string
  availableEquipment?: EquipmentType[]
}

interface AddMeasurementsBody {
  date: string
  weight?: number
  waist?: number
  bodyFat?: number
  leanBodyMass?: number
  neck?: number
  shoulders?: number
  chest?: number
  leftBicep?: number
  rightBicep?: number
  leftForearm?: number
  rightForearm?: number
  abdomen?: number
  hips?: number
  leftThigh?: number
  rightThigh?: number
  leftCalf?: number
  rightCalf?: number
  notes?: string
}

type MeasurementFields = Omit<UserMeasurement, 'id' | 'userId' | 'date' | 'createdAt' | 'updatedAt'>

interface UpdateNutritionPlanBody {
  caloriesTarget?: number
  proteinTarget?: number
  fatsTarget?: number
  carbsTarget?: number
  calculatedTDEE?: number
  deficitOrSurplus?: number
  startDate?: string
}

// utils
function parseDurationToStartDate(duration: string): Date | null {
  const norm = duration.toLowerCase()
  if (norm === 'all') return null

  const now = new Date()
  const start = new Date(now)

  // Support 1w, 14d, 1m, 3m, 1y etc
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
    // Default to 1 month if unknown
    start.setMonth(start.getMonth() - 1)
  }

  return start
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function epleyEstimated1RM(weight: number, reps: number): number {
  // Epley: 1RM = w * (1 + reps/30)
  return weight * (1 + reps / 30)
}

function getSetScore(
  exerciseType: 'repsOnly' | 'assisted' | 'weighted' | 'durationOnly',
  set: { weight: unknown; reps: number | null; durationSeconds: number | null },
): number | null {
  switch (exerciseType) {
    case 'weighted':
    case 'assisted': {
      const reps = set.reps ?? 0
      const weight = set.weight ? Number(set.weight) : 0
      if (reps <= 0 || weight <= 0) return null
      return epleyEstimated1RM(weight, reps)
    }
    case 'repsOnly': {
      const reps = set.reps ?? 0
      return reps > 0 ? reps : null
    }
    case 'durationOnly': {
      const duration = set.durationSeconds ?? 0
      return duration > 0 ? duration : null
    }
    default:
      return null
  }
}

function getExerciseWorkoutScore(
  exerciseType: 'repsOnly' | 'assisted' | 'weighted' | 'durationOnly',
  sets: Array<{ weight: unknown; reps: number | null; durationSeconds: number | null }>,
): number | null {
  let best: number | null = null
  for (const set of sets) {
    const score = getSetScore(exerciseType, set)
    if (score === null) continue
    if (best === null || score > best) best = score
  }
  return best
}

// Helper for buidling Measurment payload to return history and as well as latest and daily weight change
async function buildMeasurementPayload(userId: string, startDate?: Date | null) {
  const measurementsHistory = await prisma.userMeasurement.findMany({
    where: {
      userId,
      ...(startDate ? { date: { gte: startDate } } : {}),
    },
    orderBy: { date: 'desc' },
  })

  type Measurement = (typeof measurementsHistory)[number]

  // ---------- helpers ----------
  const isSpecialKey = (key: keyof Measurement) =>
    key === 'id' || key === 'date' || key === 'progressPicUrls'

  const toNumberOrNull = (value: unknown) => {
    if (value === null || value === undefined) return null
    const num = Number(value)
    return isNaN(num) ? null : num
  }

  const formatEntry = (entry: Measurement) => {
    const { userId, createdAt, updatedAt, ...rest } = entry

    const transformed: Partial<Record<keyof Measurement, any>> = {}

    for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
      const value = rest[key]

      if (isSpecialKey(key)) {
        transformed[key] = value
      } else {
        transformed[key] = toNumberOrNull(value)
      }
    }

    return transformed
  }

  // ---------- main processing ----------
  const latestValues: Partial<Record<keyof MeasurementFields, number | null | string[]>> = {}

  let latestWeight: number | null = null
  let previousWeight: number | null = null

  const formattedHistory = measurementsHistory.map((entry, index) => {
    const formatted = formatEntry(entry)

    // ---------- latest values (first non-null per field) ----------
    for (const key of Object.keys(formatted) as (keyof typeof formatted)[]) {
      if (key === 'id' || key === 'date') continue

      if (latestValues[key as keyof MeasurementFields] === undefined) {
        const value = formatted[key]

        if (value !== null) {
          latestValues[key as keyof MeasurementFields] = value as any
        }
      }
    }

    // ---------- weight tracking ----------
    if (entry.weight !== null) {
      const weight = Number(entry.weight)

      if (latestWeight === null) {
        latestWeight = weight
      } else if (previousWeight === null) {
        previousWeight = weight
      }
    }

    return formatted
  })

  // ---------- daily weight change ----------
  let dailyWeightChange: { diff: number; isPositive: boolean } | null = null

  if (latestWeight !== null && previousWeight !== null) {
    const diff = Math.abs(latestWeight - previousWeight)

    dailyWeightChange = {
      diff,
      isPositive: latestWeight > previousWeight,
    }
  }

  return {
    history: formattedHistory,
    latestValues,
    dailyWeightChange,
  }
}

// get
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id

  if (!userId) {
    throw new ApiError(401, 'Unauthorized')
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: selfUserSelect,
  })

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return res
    .status(200)
    .json(new ApiResponse(200, formatUserResponse(user), 'User fetched successfully'))
})

export const getFitnessProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const fitnessProfile = await prisma.userFitnessProfile.findUnique({
    where: { userId },
    select: {
      fitnessGoal: true,
      fitnessLevel: true,
      activityLevel: true,
      targetType: true,
      targetWeight: true,
      targetBodyFat: true,
      weeklyWeightChange: true,
      targetDate: true,
      injuries: true,
      availableEquipment: true,
      updatedAt: true,
    },
  })
  const formattedResponse = {
    ...fitnessProfile,
    targetWeight: fitnessProfile?.targetWeight?.toNumber?.() || null,
    targetBodyFat: fitnessProfile?.targetBodyFat?.toNumber?.() || null,
    weeklyWeightChange: fitnessProfile?.weeklyWeightChange?.toNumber?.() || null,
  }
  logDebug('Fetched user fitness profile', { action: 'getUserFitnessProfile', userId })
  return res
    .status(200)
    .json(new ApiResponse(200, formattedResponse, 'User fitness profile fetched successfully'))
})

export const getMeasurements = asyncHandler(async (req, res) => {
  const userId = req.user!.id
  const duration = (req.query.duration as string) || '3m'

  const startDate = parseDurationToStartDate(duration)

  const payload = await buildMeasurementPayload(userId, startDate)

  return res.status(200).json(new ApiResponse(200, payload, 'Measurements fetched successfully'))
})

export const getNutritionPlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const nutritionPlan = await prisma.userNutritionPlan.findUnique({
    where: { userId },
  })
  logDebug('Fetched user nutrition plan', { action: 'getUsersNutritionPlan', userId })
  return res
    .status(200)
    .json(new ApiResponse(200, nutritionPlan, 'User nutrition plan fetched successfully'))
})

export const getUserAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id

  const workoutLogs = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    include: {
      exercises: {
        include: {
          exercise: {
            select: { exerciseType: true },
          },
          sets: true,
        },
      },
    },
    orderBy: { startTime: 'desc' },
  })

  const today = new Date()

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const workoutDates = new Set<string>()
  workoutLogs.forEach((w) => {
    if (w.startTime) {
      const d = new Date(w.startTime)
      workoutDates.add(toDateKey(d))
    }
  })

  // Streak Logic
  let currentStreak = 0
  const streakCursor = new Date(today)

  if (!workoutDates.has(toDateKey(today))) {
    streakCursor.setDate(streakCursor.getDate() - 1)
    if (!workoutDates.has(toDateKey(streakCursor))) {
      currentStreak = 0
    } else {
      while (workoutDates.has(toDateKey(streakCursor))) {
        currentStreak++
        streakCursor.setDate(streakCursor.getDate() - 1)
      }
    }
  } else {
    while (workoutDates.has(toDateKey(streakCursor))) {
      currentStreak++
      streakCursor.setDate(streakCursor.getDate() - 1)
    }
  }

  // Days Since Last Workout
  const lastWorkoutDate =
    workoutLogs.length > 0 && workoutLogs[0].startTime ? new Date(workoutLogs[0].startTime) : null
  const daysSinceLastWorkout = lastWorkoutDate
    ? Math.floor((today.getTime() - lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0

  // Volume & Weekly Frequency
  const currentWeekStart = new Date(today)
  currentWeekStart.setDate(today.getDate() - today.getDay()) // Sunday
  currentWeekStart.setHours(0, 0, 0, 0)

  const lastWeekStart = new Date(currentWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)

  const lastWeekEnd = new Date(currentWeekStart)

  let workoutsThisWeek = 0
  let weeklyVolume = 0
  let lastWeekVolume = 0
  let weeklyDuration = 0
  let lastWeekDuration = 0
  let weeklyReps = 0
  let lastWeekReps = 0

  workoutLogs.forEach((workout) => {
    if (!workout.startTime) return
    const wDate = new Date(workout.startTime)

    const isThisWeek = wDate >= currentWeekStart
    const isLastWeek = wDate >= lastWeekStart && wDate < lastWeekEnd

    if (!isThisWeek && !isLastWeek) return

    if (isThisWeek) workoutsThisWeek++

    let workoutTonnage = 0
    let workoutDuration = 0
    let workoutReps = 0

    if (workout.startTime && workout.endTime) {
      workoutDuration = Math.floor(
        (new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime()) / 1000,
      )
    }

    workout.exercises.forEach((ex) => {
      const type = ex.exercise.exerciseType
      ex.sets.forEach((set) => {
        // Volume (Tonnage) - only for resistance exercises
        if (type === 'weighted' || type === 'assisted') {
          const weight = set.weight ? Number(set.weight) : 0
          const reps = set.reps ?? 0
          if (weight > 0 && reps > 0) {
            workoutTonnage += weight * reps
          }
        }
        // Reps - any set with reps
        if (set.reps) {
          workoutReps += set.reps
        }
      })
    })

    if (isThisWeek) {
      weeklyVolume += workoutTonnage
      weeklyDuration += workoutDuration
      weeklyReps += workoutReps
    }
    if (isLastWeek) {
      lastWeekVolume += workoutTonnage
      lastWeekDuration += workoutDuration
      lastWeekReps += workoutReps
    }
  })

  logDebug('Fetched user analytics', { action: 'getUserAnalytics', userId })

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        streakDays: currentStreak,
        workoutsThisWeek,
        daysSinceLastWorkout,
        weeklyVolume,
        lastWeekVolume,
        weeklyDuration,
        lastWeekDuration,
        weeklyReps,
        lastWeekReps,
        workoutDates: Array.from(workoutDates),
      },
      'User analytics fetched successfully',
    ),
  )
})

export const getTrainingAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const duration = (req.query.duration as string) || '1m'
  const startDate = parseDurationToStartDate(duration)

  const workoutLogs = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(startDate ? { startTime: { gte: startDate } } : {}),
    },
    include: {
      exercises: {
        include: {
          exercise: {
            select: { exerciseType: true },
          },
          sets: {
            where: { setType: { not: 'warmup' } },
          },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  const volumeMap = new Map<string, number>()
  const durationMap = new Map<string, number>()
  const repsMap = new Map<string, number>()

  const toDateKey = (date: Date) => date.toISOString().split('T')[0]

  workoutLogs.forEach((workout) => {
    if (!workout.startTime) return
    const dateKey = toDateKey(workout.startTime)

    let workoutVolume = 0
    let workoutReps = 0
    let workoutDuration = 0

    if (workout.startTime && workout.endTime) {
      workoutDuration = Math.floor(
        (new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime()) / 1000,
      )
    }

    workout.exercises.forEach((ex) => {
      const type = ex.exercise.exerciseType
      ex.sets.forEach((set) => {
        if (type === 'weighted' || type === 'assisted') {
          const weight = set.weight ? Number(set.weight) : 0
          const reps = set.reps ?? 0
          if (weight > 0 && reps > 0) {
            workoutVolume += weight * reps
          }
        }
        if (set.reps) {
          workoutReps += set.reps
        }
      })
    })

    volumeMap.set(dateKey, (volumeMap.get(dateKey) || 0) + workoutVolume)
    durationMap.set(dateKey, (durationMap.get(dateKey) || 0) + workoutDuration)
    repsMap.set(dateKey, (repsMap.get(dateKey) || 0) + workoutReps)
  })

  // Format as arrays of {date, value}
  const format = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date))

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        volume: format(volumeMap),
        duration: format(durationMap),
        reps: format(repsMap),
      },
      'Training metrics fetched successfully',
    ),
  )
})

export const getStrengthTrend = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const duration = (req.query.duration ?? '1m') as string
  const top = (req.query.top ?? 4) as 'all' | number | string

  const startDate = parseDurationToStartDate(duration)
  const plateauThresholdPct = 2

  const workouts = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
      startTime: {
        not: null,
        ...(startDate ? { gte: startDate } : {}),
      },
    },
    select: {
      id: true,
      startTime: true,
      createdAt: true,
      exercises: {
        select: {
          workoutId: true,
          exerciseId: true,
          exercise: {
            select: {
              title: true,
              exerciseType: true,
            },
          },
          sets: {
            where: { setType: { not: 'warmup' } },
            select: {
              weight: true,
              reps: true,
              durationSeconds: true,
            },
          },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  type Point = { ts: number; score: number }
  type ExerciseTrend = {
    exerciseId: string
    title: string
    trend: StrengthTrendDirection
    changePct: number
  }

  const exerciseToWorkoutPoints = new Map<
    string,
    {
      title: string
      exerciseType: 'repsOnly' | 'assisted' | 'weighted' | 'durationOnly'
      byWorkoutId: Map<string, Point>
    }
  >()

  for (const workout of workouts) {
    const workoutDate = workout.startTime ?? workout.createdAt
    const ts = workoutDate.getTime()

    for (const wEx of workout.exercises) {
      const exerciseType = wEx.exercise.exerciseType
      const score = getExerciseWorkoutScore(exerciseType, wEx.sets)
      if (score === null) continue

      const existing = exerciseToWorkoutPoints.get(wEx.exerciseId)
      if (!existing) {
        exerciseToWorkoutPoints.set(wEx.exerciseId, {
          title: wEx.exercise.title,
          exerciseType,
          byWorkoutId: new Map([[workout.id, { ts, score }]]),
        })
        continue
      }

      const current = existing.byWorkoutId.get(workout.id)
      if (!current || score > current.score) {
        existing.byWorkoutId.set(workout.id, { ts, score })
      }
    }
  }

  const gaining: ExerciseTrend[] = []
  const losing: ExerciseTrend[] = []
  const plateauing: ExerciseTrend[] = []

  for (const [exerciseId, entry] of exerciseToWorkoutPoints.entries()) {
    const points = Array.from(entry.byWorkoutId.values()).sort((a, b) => a.ts - b.ts)
    const scores = points.map((p) => p.score)

    const windowSize = scores.length >= 6 ? 3 : scores.length >= 4 ? 2 : 1
    const baselineAvg = average(scores.slice(0, windowSize))
    const recentAvg = average(scores.slice(-windowSize))

    const rawChangePct = baselineAvg > 0 ? ((recentAvg - baselineAvg) / baselineAvg) * 100 : 0
    const changePct = Number(rawChangePct.toFixed(2))

    let trend: StrengthTrendDirection = 'flat'
    if (Math.abs(changePct) >= plateauThresholdPct) trend = changePct > 0 ? 'up' : 'down'

    const item: ExerciseTrend = {
      exerciseId,
      title: entry.title,
      trend,
      changePct,
    }

    if (trend === 'up') gaining.push(item)
    else if (trend === 'down') losing.push(item)
    else plateauing.push(item)
  }

  gaining.sort((a, b) => b.changePct - a.changePct)
  losing.sort((a, b) => a.changePct - b.changePct)
  plateauing.sort((a, b) => Math.abs(a.changePct) - Math.abs(b.changePct))

  const topLimit =
    top === 'all'
      ? null
      : typeof top === 'number'
        ? top
        : Number.isFinite(Number(top))
          ? Number(top)
          : 4

  const limitedGaining = topLimit ? gaining.slice(0, topLimit) : gaining
  const limitedLosing = topLimit ? losing.slice(0, topLimit) : losing
  const limitedPlateauing = topLimit ? plateauing.slice(0, topLimit) : plateauing

  logDebug('Fetched strength trend', { action: 'getStrengthTrend', userId, duration })

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        gaining: limitedGaining,
        losing: limitedLosing,
        plateauing: limitedPlateauing,
        meta: {
          duration,
          startDate: startDate ? startDate.toISOString() : null,
          plateauThresholdPct,
          top: topLimit ?? 'all',
        },
      },
      'Strength trend fetched successfully',
    ),
  )
})

// post
export const addMeasurements = asyncHandler(
  async (req: Request<object, object, AddMeasurementsBody>, res: Response) => {
    const userId = req.user!.id
    const {
      date,
      weight,
      bodyFat,
      chest,
      waist,
      neck,
      leanBodyMass,
      shoulders,
      leftBicep,
      rightBicep,
      leftForearm,
      rightForearm,
      abdomen,
      hips,
      leftThigh,
      rightThigh,
      leftCalf,
      rightCalf,
      notes,
    } = req.body

    const parsedDate = new Date(date)
    parsedDate.setUTCHours(0, 0, 0, 0)

    const files = req.files as Express.Multer.File[] | undefined
    const progressPicUrls: string[] = []
    const uploadedKeys: string[] = []

    if (files && files.length > 0) {
      const uploadPromises = files.map(async (file) => {
        const tempFile: UploadedFile = {
          buffer: file.buffer,
          size: file.size,
          mimetype: file.mimetype,
          originalname: file.originalname,
        }
        const filePath = `gym-sass/measurements/${userId}/${randomUUID()}`

        if (file.mimetype.startsWith('video/')) {
          const uploaded = await uploadVideo({
            file: tempFile,
            mediaType: 'progressVideo',
            filePath,
            userId,
          })
          uploadedKeys.push(uploaded.videoKey)
          return uploaded.videoUrl
        } else {
          const url = await uploadMedia({
            file: tempFile,
            mediaType: 'progressPic',
            filePath,
            userId,
          })
          const key = extractS3KeyFromUrl(url)
          if (key) uploadedKeys.push(key)
          return url
        }
      })

      try {
        const urls = await Promise.all(uploadPromises)
        progressPicUrls.push(...urls)
      } catch (error) {
        const err = error as Error
        for (const key of uploadedKeys) {
          await deleteMediaByKey({ key, userId, reason: 'Failed during multi-upload' })
        }
        logError(
          'Failed to upload daily measurement media',
          err,
          { action: 'addDailyMeasurement', userId },
          req,
        )
        throw new ApiError(500, 'Failed to upload daily measurement media')
      }
    }

    try {
      // Start transaction
      // Start transaction
      const [measurement, updatedUser] = await prisma.$transaction([
        prisma.userMeasurement.upsert({
          where: {
            userId_date: {
              userId,
              date: parsedDate,
            },
          },
          update: {
            ...(weight !== undefined && { weight }),
            ...(bodyFat !== undefined && { bodyFat }),
            ...(chest !== undefined && { chest }),
            ...(waist !== undefined && { waist }),
            ...(neck !== undefined && { neck }),
            ...(leanBodyMass !== undefined && { leanBodyMass }),
            ...(shoulders !== undefined && { shoulders }),
            ...(leftBicep !== undefined && { leftBicep }),
            ...(rightBicep !== undefined && { rightBicep }),
            ...(leftForearm !== undefined && { leftForearm }),
            ...(rightForearm !== undefined && { rightForearm }),
            ...(abdomen !== undefined && { abdomen }),
            ...(hips !== undefined && { hips }),
            ...(leftThigh !== undefined && { leftThigh }),
            ...(rightThigh !== undefined && { rightThigh }),
            ...(leftCalf !== undefined && { leftCalf }),
            ...(rightCalf !== undefined && { rightCalf }),
            ...(notes !== undefined && { notes }),
            ...(progressPicUrls.length > 0 && {
              progressPicUrls: { push: progressPicUrls },
            }),
          },
          create: {
            userId,
            date: parsedDate,
            weight: weight ?? null,
            bodyFat: bodyFat ?? null,
            waist: waist ?? null,
            neck: neck ?? null,
            leanBodyMass: leanBodyMass ?? null,
            shoulders: shoulders ?? null,
            chest: chest ?? null,
            leftBicep: leftBicep ?? null,
            rightBicep: rightBicep ?? null,
            leftForearm: leftForearm ?? null,
            rightForearm: rightForearm ?? null,
            abdomen: abdomen ?? null,
            hips: hips ?? null,
            leftThigh: leftThigh ?? null,
            rightThigh: rightThigh ?? null,
            leftCalf: leftCalf ?? null,
            rightCalf: rightCalf ?? null,
            notes: notes ?? null,
            progressPicUrls,
          },
        }),
        // Conditionally update user weight if provided
        ...(weight !== undefined
          ? [prisma.user.update({ where: { id: userId }, data: { weight } })]
          : []),
      ])

      logDebug('Added daily measurement and updated user weight', {
        action: 'addDailyMeasurement',
        userId,
      })
      const payload = await buildMeasurementPayload(userId)

      return res
        .status(200)
        .json(new ApiResponse(200, payload, 'Daily measurement saved successfully'))
    } catch (error) {
      const err = error as Error
      // Roll back uploaded media if DB failed
      for (const key of uploadedKeys) {
        await deleteMediaByKey({
          key,
          userId,
          reason: 'daily measurement db update failure',
        })
      }
      logError(
        'Failed to save daily measurement in DB',
        err,
        { action: 'addDailyMeasurement', userId },
        req,
      )
      throw new ApiError(500, 'Failed to save daily measurement')
    }
  },
)

// put
export const updateFitnessProfile = asyncHandler(
  async (req: Request<object, object, getFitnessProfileBody>, res: Response) => {
    const userId = req.user!.id
    const updates = req.body as getFitnessProfileBody

    const transactionCommands = []

    transactionCommands.push(
      prisma.userFitnessProfile.upsert({
        where: { userId },
        update: {
          ...(updates.fitnessGoal !== undefined && { fitnessGoal: updates.fitnessGoal }),
          ...(updates.fitnessLevel !== undefined && { fitnessLevel: updates.fitnessLevel }),
          ...(updates.activityLevel !== undefined && { activityLevel: updates.activityLevel }),
          ...(updates.targetType !== undefined && { targetType: updates.targetType }),
          ...(updates.targetWeight !== undefined && { targetWeight: updates.targetWeight }),
          ...(updates.targetBodyFat !== undefined && { targetBodyFat: updates.targetBodyFat }),
          ...(updates.weeklyWeightChange !== undefined && {
            weeklyWeightChange: updates.weeklyWeightChange,
          }),
          ...(updates.targetDate !== undefined && {
            targetDate: updates.targetDate ? new Date(updates.targetDate) : null,
          }),
          ...(updates.injuries !== undefined && { injuries: updates.injuries }),
          ...(updates.availableEquipment !== undefined && {
            availableEquipment: updates.availableEquipment,
          }),
        },
        create: {
          userId,
          fitnessGoal: updates.fitnessGoal ?? null,
          fitnessLevel: updates.fitnessLevel ?? null,
          activityLevel: updates.activityLevel ?? null,
          targetType: updates.targetType ?? null,
          targetWeight: updates.targetWeight ?? null,
          targetBodyFat: updates.targetBodyFat ?? null,
          weeklyWeightChange: updates.weeklyWeightChange ?? null,
          targetDate: updates.targetDate ? new Date(updates.targetDate) : null,
          injuries: updates.injuries ?? null,
          availableEquipment: updates.availableEquipment ?? [],
        },
        select: {
          fitnessGoal: true,
          fitnessLevel: true,
          activityLevel: true,
          targetType: true,
          targetWeight: true,
          targetBodyFat: true,
          weeklyWeightChange: true,
          targetDate: true,
          injuries: true,
          availableEquipment: true,
          updatedAt: true,
        },
      }),
    )

    const results = await prisma.$transaction(transactionCommands)

    const updatedFitnessProfile = results[0]

    const formattedResponse = {
      ...updatedFitnessProfile,
      targetWeight: updatedFitnessProfile?.targetWeight?.toNumber?.() || null,
      targetBodyFat: updatedFitnessProfile?.targetBodyFat?.toNumber?.() || null,
      weeklyWeightChange: updatedFitnessProfile?.weeklyWeightChange?.toNumber?.() || null,
    }
    logDebug('User fitness profile updated successfully', {
      action: 'updateUserFitnessProfile',
      user: userId,
    })
    return res
      .status(200)
      .json(new ApiResponse(200, formattedResponse, 'User fitness profile updated successfully '))
  },
)

export const updateNutritionPlan = asyncHandler(
  async (req: Request<object, object, UpdateNutritionPlanBody>, res: Response) => {
    const userId = req.user!.id
    const updates = req.body as UpdateNutritionPlanBody

    const nutritionPlan = await prisma.userNutritionPlan.upsert({
      where: { userId },
      update: {
        ...(updates.caloriesTarget !== undefined && { caloriesTarget: updates.caloriesTarget }),
        ...(updates.proteinTarget !== undefined && { proteinTarget: updates.proteinTarget }),
        ...(updates.fatsTarget !== undefined && { fatsTarget: updates.fatsTarget }),
        ...(updates.carbsTarget !== undefined && { carbsTarget: updates.carbsTarget }),
        ...(updates.calculatedTDEE !== undefined && { calculatedTDEE: updates.calculatedTDEE }),
        ...(updates.deficitOrSurplus !== undefined && {
          deficitOrSurplus: updates.deficitOrSurplus,
        }),
        ...(updates.startDate !== undefined && { startDate: new Date(updates.startDate) }),
      },
      create: {
        userId,
        caloriesTarget: updates.caloriesTarget ?? null,
        proteinTarget: updates.proteinTarget ?? null,
        fatsTarget: updates.fatsTarget ?? null,
        carbsTarget: updates.carbsTarget ?? null,
        calculatedTDEE: updates.calculatedTDEE ?? null,
        deficitOrSurplus: updates.deficitOrSurplus ?? null,
        startDate: updates.startDate ? new Date(updates.startDate) : new Date(),
      },
    })
    logDebug('Updated user nutrition plan', { action: 'updateUserNutritionPlan', userId })
    return res
      .status(200)
      .json(new ApiResponse(200, nutritionPlan, 'User nutrition plan updated successfully'))
  },
)

// patch
export const updateMe = asyncHandler(
  async (req: Request<object, object, UpdateMeBody>, res: Response) => {
    const userId = req.user!.id
    const updates = req.body

    logDebug('updates logged', updates as unknown as Record<string, unknown>)

    const allowedFields: (keyof UpdateMeBody)[] = [
      'firstName',
      'lastName',
      'dateOfBirth',
      'preferredWeightUnit',
      'preferredLengthUnit',
      'height',
      'weight',
      'gender',
    ]
    const fieldsToUpdate: Partial<UpdateMeBody> = {}

    const existingUser = await prisma.user.findUnique({ where: { id: userId } })

    if (!existingUser) {
      logWarn('User does not exist', { action: 'findUser', userId })
      throw new ApiError(404, 'User does not exist')
    }

    for (const field of allowedFields) {
      if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') {
        ;(fieldsToUpdate as Record<string, unknown>)[field] = updates[field]
      }
    }

    if (Object.keys(fieldsToUpdate).length <= 0) {
      logWarn('No valid fields provided for updating', { action: 'updateMe' })
      throw new ApiError(404, 'No valid fields provided for update')
    }

    const updatedUser = await prisma.user.update({
      select: selfUserSelect,
      where: { id: userId },
      data: {
        ...fieldsToUpdate,
        dateOfBirth: fieldsToUpdate.dateOfBirth
          ? new Date(fieldsToUpdate.dateOfBirth)
          : existingUser.dateOfBirth,
      },
    })

    return res
      .status(200)
      .json(new ApiResponse(200, formatUserResponse(updatedUser), 'Details updated successfully'))
  },
)

export const updateMyProfilePic = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const file = req.file as UploadedFile | undefined

  if (!file) {
    logWarn('No file provided', { action: 'updateMyProfilePic' }, req)
    throw new ApiError(400, 'No file provided')
  }

  const user = await prisma.user.findUnique({
    select: { id: true, profilePicUrl: true },
    where: { id: userId },
  })

  if (!user) {
    logWarn('User does not exist', { action: 'updateMyProfilePic', userId }, req)
    throw new ApiError(404, 'User does not exist')
  }

  let newProfilePicUrl: string

  try {
    newProfilePicUrl = await uploadProfilePicture(file, userId)
  } catch (error) {
    const err = error as Error
    logWarn(
      'Failed to upload profile picture',
      { action: 'updateMyProfilePic', error: err.message },
      req,
    )
    throw new ApiError(500, 'Failed to upload profile picture')
  }

  const updatedUser = await prisma.user.update({
    select: selfUserSelect,
    where: { id: userId },
    data: { profilePicUrl: newProfilePicUrl },
  })

  if (user.profilePicUrl) {
    try {
      await deleteProfilePicture(userId, user.profilePicUrl)
    } catch (error) {
      const err = error as Error
      logWarn(
        'Failed to delete old profile picture',
        {
          action: 'updateMyProfilePic',
          userId,
          oldProfilePicUrl: user.profilePicUrl,
          error: err.message,
        },
        req,
      )
    }
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, formatUserResponse(updatedUser), 'Profile picture updated successfully'),
    )
})

// delete
export const deleteMyProfilePic = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id

  const user = await prisma.user.findUnique({
    select: { id: true, profilePicUrl: true },
    where: { id: userId },
  })

  if (!user) {
    logWarn('User does not exist', { action: 'deleteMyProfilePic', userId }, req)
    throw new ApiError(404, 'User does not exist')
  }

  try {
    await deleteProfilePicture(userId, user.profilePicUrl!)
  } catch (error) {
    const err = error as Error
    logWarn(
      'Failed to delete profile picture',
      { action: 'deleteMyProfilePic', error: err.message },
      req,
    )
    throw new ApiError(500, 'Failed to delete profile picture')
  }

  const updatedUser = await prisma.user.update({
    select: selfUserSelect,
    where: { id: userId },
    data: { profilePicUrl: null },
  })

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        formatUserResponse(updatedUser),
        'Profile picture deleted successfully ',
      ),
    )
})
