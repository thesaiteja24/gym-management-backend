import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())

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

export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function epleyEstimated1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function getSetScore(
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

export function getExerciseWorkoutScore(
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

    // Convert Decimals to numbers
    for (const key in formatted) {
      if (key !== 'id' && key !== 'date' && key !== 'progressPicUrls') {
        const val = formatted[key]
        formatted[key] = val !== null ? Number(val) : null
      }
    }

    // Capture latest values
    for (const key in formatted) {
      if (key === 'id' || key === 'date') continue
      if (latestValues[key] === undefined && formatted[key] !== null) {
        latestValues[key] = formatted[key]
      }
    }

    // Weight tracking
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

  // Streak Logic
  let currentStreak = 0
  const streakCursor = new Date(today)
  if (!workoutDates.has(toDateKey(today))) {
    streakCursor.setDate(streakCursor.getDate() - 1)
  }
  while (workoutDates.has(toDateKey(streakCursor))) {
    currentStreak++
    streakCursor.setDate(streakCursor.getDate() - 1)
  }

  // Frequency and Volume
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
