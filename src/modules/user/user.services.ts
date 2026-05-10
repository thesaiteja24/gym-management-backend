import type { Exercise } from '@prisma/client'

import { prisma, readPrisma } from '../../lib/prisma.js'
import { NotificationService } from '../../service/notification.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { withRetry } from '../../utils/dbUtils.js'

import { analyzeRelationship, analyzeWorkoutState } from './nudge.analyzer.js'
import { resolveNudgeTemplate } from './nudge.templates.js'
import type { NudgeIntent } from './nudge.types.js'
import { formatPublicUser } from './user.formatters.js'
import { getPublicUserSelect } from './user.selectors.js'
import type { PublicUser } from './user.types.js'
import type { TopLift } from './user.types.js'







// SECTION: PUBLIC USER DATABASE OPERATIONS
/**
 * Fetch a public user profile by ID.
 * @param userId The ID of the user to fetch
 * @param currentUserId Optional ID of the user making the request (for follow status)
 * @returns Formatted public user data
 */
export async function getUserById(userId: string, currentUserId?: string): Promise<PublicUser> {
  const user = await withRetry(() => readPrisma.user.findUnique({
    where: { id: userId },
    select: getPublicUserSelect(currentUserId),
  }))

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return formatPublicUser(user, currentUserId)
}

export async function dispatchNudge(
  senderId: string,
  receiverId: string,
  intent?: NudgeIntent,
  note?: string
): Promise<boolean> {
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { firstName: true },
  })

  if (!sender) {
    throw new ApiError(404, 'Sender not found')
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true },
  })

  if (!receiver) {
    throw new ApiError(404, 'Receiver not found')
  }

  // Analyze Context
  const [workoutState, relationship] = await Promise.all([
    analyzeWorkoutState(receiverId),
    analyzeRelationship(senderId, receiverId),
  ])

  // Resolve Template
  const message = resolveNudgeTemplate({
    senderName: sender.firstName ?? 'Pump user',
    state: workoutState,
    relationship,
    intent,
    personalNote: note,
  })

  // Dispatch Notification
  await NotificationService.sendPushToUsers(
    [receiverId],
    message.title,
    message.content
  ).catch((error) => {
    console.error('Failed to send nudge push notification:', error)
  })

  return true
}

export async function getTopLifts(userId: string, limit: number = 5): Promise<TopLift[]> {
  const allExercises = await readPrisma.workoutLogExercise.findMany({
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
    bestVolume: number
    bestReps: number
    bestDuration: number
  }> = {}

  allExercises.forEach((logEx) => {
    const exId = logEx.exerciseId
    const workingSets = logEx.sets.filter(s => s.setType !== 'warmup')

    if (workingSets.length === 0)
      return

    if (!exercisesMap[exId]) {
      exercisesMap[exId] = {
        exercise: logEx.exercise,
        bestSet: null,
        totalSets: 0,
        totalOccurrences: 0,
        bestVolume: 0,
        bestReps: 0,
        bestDuration: 0,
      }
    }

    exercisesMap[exId].totalOccurrences++
    exercisesMap[exId].totalSets += workingSets.length

    workingSets.forEach((set) => {
      const currentBest = exercisesMap[exId].bestSet
      const type = logEx.exercise.exerciseType

      let isNewBest = false
      const setWeight = Number(set.weight) || 0
      const setReps = set.reps || 0
      const setDuration = set.durationSeconds || 0
      const setVolume = setWeight * setReps

      if (!currentBest) {
        isNewBest = true
      }
      else {
        if (type === 'weighted' || type === 'assisted') {
          const currentVolume = (Number(currentBest.weight) || 0) * (currentBest.reps || 0)
          if (setVolume > currentVolume) {
            isNewBest = true
          }
          else if (setVolume === currentVolume && setWeight > (Number(currentBest.weight) || 0)) {
            isNewBest = true
          }
        }
        else if (type === 'durationOnly') {
          if (setDuration > (currentBest.durationSeconds || 0)) {
            isNewBest = true
          }
        }
        else { // repsOnly
          if (setReps > (currentBest.reps || 0)) {
            isNewBest = true
          }
        }
      }

      if (isNewBest) {
        exercisesMap[exId].bestSet = set
        exercisesMap[exId].bestVolume = setVolume
        exercisesMap[exId].bestReps = setReps
        exercisesMap[exId].bestDuration = setDuration
      }
    })
  })

  const sortedExercises = Object.values(exercisesMap)
    .sort((a, b) => {
      // 1. Frequency (Most Frequent)
      if (b.totalOccurrences !== a.totalOccurrences) {
        return b.totalOccurrences - a.totalOccurrences
      }
      // 2. Weight Volume
      if (b.bestVolume !== a.bestVolume) {
        return b.bestVolume - a.bestVolume
      }
      // 3. Reps
      if (b.bestReps !== a.bestReps) {
        return b.bestReps - a.bestReps
      }
      // 4. Duration
      return b.bestDuration - a.bestDuration
    })
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

export async function getTrainingAnalytics(userId: string, startDate: Date | null) {
  const workoutLogs = await readPrisma.workoutLog.findMany({
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

  const analytics: Record<
    string,
    { volume: number; reps: number; duration: number; workouts: number }
  > = {}

  workoutLogs.forEach((w) => {
    if (!w.startTime) {
      return
    }
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

  // Transform to the format expected by the frontend
  const volume = Object.entries(analytics).map(([date, data]) => ({
    date,
    value: data.volume,
  }))
  const reps = Object.entries(analytics).map(([date, data]) => ({
    date,
    value: data.reps,
  }))
  const duration = Object.entries(analytics).map(([date, data]) => ({
    date,
    value: data.duration,
  }))

  return { volume, reps, duration }
}