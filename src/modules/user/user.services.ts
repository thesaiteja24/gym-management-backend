import { Exercise, PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { ApiError } from '../../utils/ApiError.js'

import type { PublicUser } from './user.types.js'
import { buildNudgeNotification } from './nudge.util.js'
import { NotificationService } from '../../service/notification.service.js'
import { formatPublicUser } from './user.formatters.js'
import { getPublicUserSelect, publicUserSelect } from './user.selectors.js'
import type { TopLift, WorkoutActivity } from './user.types.js'

const prisma = new PrismaClient().$extends(withAccelerate())




// SECTION: PUBLIC USER DATABASE OPERATIONS
/**
 * Fetch a public user profile by ID.
 * @param userId The ID of the user to fetch
 * @param currentUserId Optional ID of the user making the request (for follow status)
 * @returns Formatted public user data
 */
export async function getUserById(userId: string, currentUserId?: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: getPublicUserSelect(currentUserId),
  })

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return formatPublicUser(user, currentUserId)
}

/**
 * Function to nudge a user.
 * @param userId The ID of the user to nudge
 * @param currentUserId The ID of the user making the request
 * @param note The optional note to send to the user
 */
export async function nudgeUser(userId: string, currentUserId: string, note?: string) {
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
  })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      workoutLogs: {
        where: { deletedAt: null },
        orderBy: { startTime: 'desc' },
        take: 1,
        select: { startTime: true },
      },
    },
  })

  if (!user) {
    throw new ApiError(404, 'Receiver not found')
  }

  if (!currentUser) {
    throw new ApiError(404, 'Sender not found')
  }

  // Calculate if the user has an active streak (workout today or yesterday)
  const toDateKey = (date: Date) => date.toISOString().split('T')[0]
  const now = new Date()
  const today = toDateKey(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(now.getDate() - 1)
  const yesterday = toDateKey(yesterdayDate)

  const lastWorkoutDate = (user as any).workoutLogs?.[0]?.startTime
    ? toDateKey(new Date((user as any).workoutLogs[0].startTime))
    : null

  const hasActiveStreak = !!lastWorkoutDate && (lastWorkoutDate === today || lastWorkoutDate === yesterday)

  const message = buildNudgeNotification({
    senderName: currentUser.firstName ?? 'Pump user',
    hasActiveStreak,
    personalNote: note,
  })

  await NotificationService.sendPushToUsers(
    [userId],
    message.title,
    message.content
  ).catch(() => {})

  return true
}

export async function getWorkoutActivity(userId: string, days: number = 30): Promise<WorkoutActivity> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (days - 1))
  startDate.setHours(0, 0, 0, 0)

  const workouts = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
      startTime: { gte: startDate },
    },
    include: {
      exercises: {
        include: {
          sets: true,
          exercise: { select: { exerciseType: true } },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  const activity: Record<string, { count: number; volume: number }> = {}

  // Initialize all days in range with 0
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    const dateKey = d.toISOString().split('T')[0]
    activity[dateKey] = { count: 0, volume: 0 }
  }

  workouts.forEach((w) => {
    if (!w.startTime)
      return
    const dateKey = w.startTime.toISOString().split('T')[0]
    if (!activity[dateKey]) {
      activity[dateKey] = { count: 0, volume: 0 }
    }

    activity[dateKey].count++
    w.exercises.forEach((ex) => {
      ex.sets.forEach((set) => {
        if (ex.exercise.exerciseType === 'weighted' || ex.exercise.exerciseType === 'assisted') {
          activity[dateKey].volume += (Number(set.weight) || 0) * (set.reps || 0)
        }
      })
    })
  })

  return activity
}

export async function getTopLifts(userId: string, limit: number = 5): Promise<TopLift[]> {
  const allExercises = await prisma.workoutLogExercise.findMany({
    where: {
      workout: {
        userId,
        deletedAt: null,
      },
    },
    include: {
      exercise: true,
      sets: true,
    },
  })

  const exercisesMap: Record<string, {
    exercise: Exercise
    bestSet: any
    totalSets: number
    totalOccurrences: number
  }> = {}

  allExercises.forEach((logEx) => {
    const exId = logEx.exerciseId
    if (!exercisesMap[exId]) {
      exercisesMap[exId] = {
        exercise: logEx.exercise,
        bestSet: null,
        totalSets: 0,
        totalOccurrences: 0,
      }
    }

    exercisesMap[exId].totalOccurrences++
    exercisesMap[exId].totalSets += logEx.sets.length

    logEx.sets.forEach((set) => {
      const currentBest = exercisesMap[exId].bestSet
      if (!currentBest) {
        exercisesMap[exId].bestSet = set
        return
      }

      const type = logEx.exercise.exerciseType
      if (type === 'weighted' || type === 'assisted') {
        const currentScore = (Number(currentBest.weight) || 0) * (currentBest.reps || 0)
        const newScore = (Number(set.weight) || 0) * (set.reps || 0)
        if (newScore > currentScore) {
          exercisesMap[exId].bestSet = set
        }
        else if (newScore === currentScore && (Number(set.weight) || 0) > (Number(currentBest.weight) || 0)) {
          exercisesMap[exId].bestSet = set
        }
      }
      else if (type === 'durationOnly') {
        if ((set.durationSeconds || 0) > (currentBest.durationSeconds || 0)) {
          exercisesMap[exId].bestSet = set
        }
      }
      else { // repsOnly
        if ((set.reps || 0) > (currentBest.reps || 0)) {
          exercisesMap[exId].bestSet = set
        }
      }
    })
  })

  const sortedExercises = Object.values(exercisesMap)
    .sort((a, b) => b.totalOccurrences - a.totalOccurrences)
    .slice(0, limit)

  return sortedExercises.map(item => ({
    exerciseId: item.exercise.id,
    title: item.exercise.title,
    thumbnailUrl: item.exercise.thumbnailUrl,
    totalSets: item.totalSets,
    bestSet: {
      weight: item.bestSet ? Number(item.bestSet.weight) : null,
      reps: item.bestSet ? item.bestSet.reps : null,
      durationSeconds: item.bestSet ? item.bestSet.durationSeconds : null,
      setType: item.bestSet ? item.bestSet.setType : 'working',
      createdAt: item.bestSet ? item.bestSet.createdAt : new Date(),
    },
  }))
}