import { type Prisma } from '@prisma/client'

import { prisma, readPrisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/ApiError.js'
import { withRetry } from '../../utils/dbUtils.js'
import { generateSecureToken } from '../../utils/helpers.js'
import { invalidateUserProgramCache } from '../programs/service.js'
import { publicUserSelect } from '../user/user.selectors.js'

import { formatWorkout } from './formatter.js'
import { advanceProgramProgress } from './programUtils.js'
import { processWorkoutTransaction } from './transaction.js'
import type {
  CreateWorkoutBody,
  PaginatedWorkoutsResponse,
  UpdateWorkoutBody,
  Workout,
  WorkoutResponse,
} from './types.js'



// SECTION: CONFIG

export const workoutSelect = {
  id: true,
  clientId: true,
  shareId: true,
  title: true,
  startTime: true,
  endTime: true,
  createdAt: true,
  updatedAt: true,
  isEdited: true,
  editedAt: true,
  deletedAt: true,
  visibility: true,
  likesCount: true,
  commentsCount: true,
  exerciseGroups: {
    orderBy: { groupIndex: 'asc' },
    select: {
      id: true,
      groupType: true,
      groupIndex: true,
      restSeconds: true,
      note: true,
    },
  },
  exercises: {
    orderBy: { exerciseIndex: 'asc' },
    select: {
      id: true,
      exerciseId: true,
      exerciseIndex: true,
      exerciseGroupId: true,
      exercise: {
        select: {
          id: true,
          title: true,
          instructions: true,
          primaryMuscleGroupId: true,
          equipmentId: true,
          exerciseType: true,
          videoUrl: true,
          thumbnailUrl: true,
          primaryMuscleGroup: true,
          equipment: true,
          otherMuscleGroups: { select: { muscleGroup: true } },
        },
      },
      sets: {
        orderBy: { setIndex: 'asc' },
        select: {
          id: true,
          setIndex: true,
          setType: true,
          weight: true,
          reps: true,
          rpe: true,
          durationSeconds: true,
          restSeconds: true,
          note: true,
        },
      },
    },
  },
  user: {
    select: publicUserSelect,
  },
} satisfies Prisma.WorkoutLogSelect

export const workoutListSelect = {
  id: true,
  clientId: true,
  shareId: true,
  title: true,
  startTime: true,
  endTime: true,
  createdAt: true,
  updatedAt: true,
  isEdited: true,
  editedAt: true,
  deletedAt: true,
  visibility: true,
  likesCount: true,
  commentsCount: true,
  exerciseGroups: {
    orderBy: { groupIndex: 'asc' },
    select: {
      id: true,
      groupType: true,
      groupIndex: true,
      restSeconds: true,
      note: true,
    },
  },
  exercises: {
    orderBy: { exerciseIndex: 'asc' },
    select: {
      id: true,
      exerciseId: true,
      exerciseIndex: true,
      exerciseGroupId: true,
      exercise: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          exerciseType: true,
          primaryMuscleGroup: true,
          otherMuscleGroups: { select: { muscleGroup: true } },
        },
      },
      sets: {
        orderBy: { setIndex: 'asc' },
        select: {
          id: true,
          setIndex: true,
          setType: true,
          weight: true,
          reps: true,
          rpe: true,
          durationSeconds: true,
        },
      },
    },
  },
  user: {
    select: publicUserSelect,
  },
} satisfies Prisma.WorkoutLogSelect

// SECTION: HIGH-LEVEL SERVICES

/**
 * Creates a new workout log with idempotency check.
 */
export async function createWorkout(
  userId: string,
  body: CreateWorkoutBody,
): Promise<WorkoutResponse> {
  const {
    clientId,
    title,
    startTime,
    endTime,
    exercises,
    exerciseGroups,
    visibility,
    userProgramDayId,
  } = body

  // Idempotency check for mobile clients
  if (clientId) {
    const existing = await withRetry(() => prisma.workoutLog.findUnique({
      where: { clientId },
      select: workoutSelect,
    }))
    if (existing) {
      return {
        workout: formatWorkout(existing),
      }
    }
  }

  let droppedSets = 0
  let droppedExercises = 0
  let droppedGroups = 0
  let workoutId: string

  try {
    await prisma.$transaction(async (tx) => {
      const workout = await tx.workoutLog.create({
        data: {
          userId,
          clientId,
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          visibility,
          shareId: generateSecureToken(),
        },
      })
      workoutId = workout.id

      const result = await processWorkoutTransaction(tx as any, workoutId, {
        exercises,
        exerciseGroups,
      })
      droppedSets = result.droppedSets
      droppedExercises = result.droppedExercises
      droppedGroups = result.droppedGroups

      if (userProgramDayId) {
        await advanceProgramProgress(tx as any, userProgramDayId, workoutId)
      }
    })

    if (userProgramDayId) {
      await invalidateUserProgramCache(userId)
    }
  } catch (error) {
    throw error instanceof ApiError ? error : new ApiError(500, 'Failed to create workout')
  }

  const fullWorkout = await prisma.workoutLog.findUnique({
    where: { id: workoutId! },
    select: workoutSelect,
  })

  if (!fullWorkout) throw new ApiError(500, 'Failed to retrieve created workout')

  return {
    workout: formatWorkout(fullWorkout),
    meta: { droppedSets, droppedExercises, droppedGroups },
  }
}

/**
 * Generic listing for workouts based on scope (personal, specific user, or discovery).
 */
export async function listWorkouts(
  requesterId: string,
  params: {
    page: number
    limit: number
    userId?: string
  },
): Promise<PaginatedWorkoutsResponse> {
  const { page, limit, userId: targetUserId } = params
  const skip = (page - 1) * limit

  const where: Prisma.WorkoutLogWhereInput = {
    deletedAt: null,
  }

  // LOGIC:
  // 1. If targetUserId is provided and it is NOT the requester -> fetch public workouts of that user.
  // 2. If targetUserId is provided and it IS the requester -> fetch all workouts of the requester.
  // 3. If targetUserId is NOT provided -> fetch public workouts of EVERYONE ELSE (Discovery).
  
  if (targetUserId) {
    where.userId = targetUserId
    if (targetUserId !== requesterId) {
      where.visibility = 'public'
    }
  } else {
    // Discovery Mode: Everything public not by me
    where.userId = { not: requesterId }
    where.visibility = 'public'
  }

  try {
    const workouts = await withRetry(() =>
      readPrisma.workoutLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: workoutListSelect,
      }),
    )

    const hasMore = workouts.length === limit
    return {
      workouts: workouts.map(formatWorkout),
      meta: { currentPage: page, limit, hasMore },
    }
  } catch (_error) {
    throw new ApiError(500, 'Failed to fetch workouts')
  }
}

/**
 * Fetches a single workout by ID.
 */
export async function getWorkoutById(workoutId: string): Promise<Workout> {
  const workout = await withRetry(() => readPrisma.workoutLog.findUnique({
    where: { id: workoutId },
    select: workoutSelect,
  }))

  if (!workout || workout.deletedAt) {
    throw new ApiError(404, 'Workout not found')
  }

  return formatWorkout(workout)
}

/**
 * Soft deletes a workout log.
 */
export async function deleteWorkout(userId: string, workoutId: string): Promise<void> {
  const workout = await prisma.workoutLog.findUnique({
    where: { id: workoutId },
    select: { userId: true },
  })

  if (!workout || workout.userId !== userId) {
    throw new ApiError(404, 'Workout not found')
  }

  await prisma.workoutLog.update({
    where: { id: workoutId },
    data: { deletedAt: new Date() },
  })
}

/**
 * Updates an existing workout log.
 */
export async function updateWorkout(
  userId: string,
  workoutId: string,
  body: UpdateWorkoutBody,
): Promise<WorkoutResponse> {
  const { title, startTime, endTime, exercises, exerciseGroups, visibility } = body

  let droppedSets = 0
  let droppedExercises = 0
  let droppedGroups = 0

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.workoutLog.findUnique({
        where: { id: workoutId },
        select: { userId: true, deletedAt: true, shareId: true },
      })

      if (!existing || existing.userId !== userId) {
        throw new ApiError(404, 'Workout not found')
      }
      if (existing.deletedAt) {
        throw new ApiError(400, 'Cannot update deleted workout')
      }

      // Clear existing exercises/groups for reconstruction
      await tx.workoutLogExercise.deleteMany({ where: { workoutId } })
      await tx.workoutLogExerciseGroup.deleteMany({ where: { workoutId } })

      await tx.workoutLog.update({
        where: { id: workoutId },
        data: {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          isEdited: true,
          editedAt: new Date(),
          visibility,
          shareId: existing.shareId || generateSecureToken(),
        },
      })

      const result = await processWorkoutTransaction(tx as any, workoutId, {
        exercises,
        exerciseGroups,
      })
      droppedSets = result.droppedSets
      droppedExercises = result.droppedExercises
      droppedGroups = result.droppedGroups
    })
  } catch (error) {
    throw error instanceof ApiError ? error : new ApiError(500, 'Failed to update workout')
  }

  const updatedWorkout = await prisma.workoutLog.findUnique({
    where: { id: workoutId },
    select: workoutSelect,
  })

  if (!updatedWorkout) throw new ApiError(500, 'Failed to retrieve updated workout')

  return {
    workout: formatWorkout(updatedWorkout),
    meta: { droppedSets, droppedExercises, droppedGroups },
  }
}

/**
 * Fetches a workout by its public share ID.
 */
export async function getWorkoutByShareId(shareId: string): Promise<Workout> {
  const workout = await withRetry(() => readPrisma.workoutLog.findUnique({
    where: { shareId },
    select: workoutSelect,
  }))

  if (!workout || workout.deletedAt || workout.visibility === 'private') {
    throw new ApiError(404, 'Shared workout not found')
  }

  return formatWorkout(workout)
}
