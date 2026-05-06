import { PrismaClient, type Prisma } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { ApiError } from '../../utils/ApiError.js'
import { generateSecureToken } from '../../utils/helpers.js'
import { isValidCompletedSet } from '../../utils/workoutValidation.js'
import { flattenExercise } from '../exercise/service.js'
import { invalidateUserProgramCache } from '../programs/service.js'
import { formatPublicUser, publicUserSelect } from '../user/service.js'

import type {
  CreateWorkoutBody,
  ExerciseGroupInput,
  ExerciseInput,
  PaginatedWorkoutsResponse,
  UpdateWorkoutBody,
  Workout,
  WorkoutResponse,
} from './types.js'

const prisma = new PrismaClient().$extends(withAccelerate())

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

// SECTION: HELPERS

/**
 * Formats a raw Prisma workout log into the standardized Workout interface.
 */
export function formatWorkout(
  workout: Prisma.WorkoutLogGetPayload<{ select: typeof workoutSelect }>,
): Workout {
  if (!workout) return null as any

  return {
    ...workout,
    startTime: workout.startTime?.toISOString() || '',
    endTime: workout.endTime?.toISOString() || '',
    createdAt: workout.createdAt?.toISOString(),
    updatedAt: workout.updatedAt?.toISOString(),
    editedAt: workout.editedAt?.toISOString() || null,
    deletedAt: workout.deletedAt?.toISOString() || null,
    exercises: (workout.exercises || []).map((we) => ({
      ...we,
      exercise: flattenExercise(we.exercise),
      sets: (we.sets || []).map((s) => ({
        ...s,
        weight: s.weight ? Number(s.weight) : null,
      })),
    })),
    exerciseGroups: (workout.exerciseGroups || []).map((eg) => ({
      ...eg,
      restSeconds: eg.restSeconds ?? null,
      note: eg.note ?? null,
    })),
    user: formatPublicUser(workout.user),
  } as Workout
}

// SECTION: TRANSACTIONAL SERVICES

/**
 * Creates exercise groups within a transaction and returns a map of client IDs to database IDs.
 */
async function createExerciseGroups(
  tx: Prisma.TransactionClient,
  workoutId: string,
  groups: ExerciseGroupInput[],
) {
  const idMap = new Map<string, string>()
  const sorted = [...groups].sort((a, b) => a.groupIndex - b.groupIndex)

  for (let i = 0; i < sorted.length; i++) {
    const created = await tx.workoutLogExerciseGroup.create({
      data: {
        workoutId,
        groupType: sorted[i].groupType,
        groupIndex: i,
        restSeconds: sorted[i].restSeconds ?? null,
      },
    })
    idMap.set(sorted[i].id, created.id)
  }
  return idMap
}

/**
 * Creates exercises and their associated sets within a transaction.
 */
async function createExercisesWithSets(
  tx: Prisma.TransactionClient,
  workoutId: string,
  exercises: ExerciseInput[],
  groupIdMap: Map<string, string>,
) {
  let droppedSets = 0
  let droppedExercises = 0
  const persistedIds: string[] = []

  for (const ex of exercises) {
    const meta = await tx.exercise.findUnique({
      where: { id: ex.exerciseId },
      select: { exerciseType: true },
    })

    if (!meta) {
      droppedExercises++
      continue
    }

    const validSets = ex.sets.filter((s) => isValidCompletedSet(s as any, meta.exerciseType))
    droppedSets += ex.sets.length - validSets.length

    if (validSets.length === 0) {
      droppedExercises++
      continue
    }

    const workoutEx = await tx.workoutLogExercise.create({
      data: {
        workoutId,
        exerciseId: ex.exerciseId,
        exerciseIndex: ex.exerciseIndex,
        exerciseGroupId: ex.exerciseGroupId ? (groupIdMap.get(ex.exerciseGroupId) ?? null) : null,
      },
    })

    persistedIds.push(workoutEx.id)

    await tx.workoutLogExerciseSet.createMany({
      data: validSets.map((s) => ({
        workoutExerciseId: workoutEx.id,
        setIndex: s.setIndex,
        setType: s.setType,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        rpe: s.rpe ?? null,
        durationSeconds: s.durationSeconds ?? null,
        restSeconds: s.restSeconds ?? null,
        note: s.note ?? null,
      })),
    })
  }

  return { persistedIds, droppedSets, droppedExercises }
}

/**
 * Prunes empty groups and re-indexes remaining groups.
 */
async function pruneAndReindexGroups(
  tx: Prisma.TransactionClient,
  workoutId: string,
  persistedExerciseIds: string[],
  groupIdMap: Map<string, string>,
) {
  let droppedGroups = 0

  // Count usage of each group
  const groupUsage = new Map<string, number>()
  const exercises = await tx.workoutLogExercise.findMany({
    where: { id: { in: persistedExerciseIds } },
    select: { exerciseGroupId: true },
  })

  exercises.forEach((ex) => {
    if (ex.exerciseGroupId) {
      groupUsage.set(ex.exerciseGroupId, (groupUsage.get(ex.exerciseGroupId) || 0) + 1)
    }
  })

  // Delete groups with fewer than 2 exercises (not a real group)
  for (const [, dbId] of groupIdMap) {
    if ((groupUsage.get(dbId) || 0) < 2) {
      droppedGroups++
      await tx.workoutLogExerciseGroup.delete({ where: { id: dbId } })
      // Prisma handles the update of exercises to null via onDelete: SetNull or manual if not configured
      await tx.workoutLogExercise.updateMany({
        where: { exerciseGroupId: dbId },
        data: { exerciseGroupId: null },
      })
    }
  }

  // Re-index remaining groups
  const remaining = await tx.workoutLogExerciseGroup.findMany({
    where: { workoutId },
    orderBy: { groupIndex: 'asc' },
  })

  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].groupIndex !== i) {
      await tx.workoutLogExerciseGroup.update({
        where: { id: remaining[i].id },
        data: { groupIndex: i },
      })
    }
  }

  return droppedGroups
}

/**
 * Main processor for workout data within a transaction.
 */
export async function processWorkoutTransaction(
  tx: Prisma.TransactionClient,
  workoutId: string,
  data: { exercises: ExerciseInput[]; exerciseGroups?: ExerciseGroupInput[] },
) {
  const groupIdMap = data.exerciseGroups
    ? await createExerciseGroups(tx, workoutId, data.exerciseGroups)
    : new Map<string, string>()

  const { persistedIds, droppedSets, droppedExercises } = await createExercisesWithSets(
    tx,
    workoutId,
    data.exercises,
    groupIdMap,
  )

  if (persistedIds.length === 0) {
    throw new ApiError(400, 'No valid exercises provided in workout')
  }

  const droppedGroups = await pruneAndReindexGroups(tx, workoutId, persistedIds, groupIdMap)

  return { droppedSets, droppedExercises, droppedGroups }
}

/**
 * Advances program progress if the workout is linked to a user program.
 */
export async function advanceProgramProgress(
  tx: Prisma.TransactionClient,
  userProgramDayId: string,
  workoutId: string,
) {
  const day = await tx.userProgramDay.findUnique({
    where: { id: userProgramDayId },
    include: {
      week: {
        include: {
          userProgram: {
            include: { progress: true },
          },
        },
      },
    },
  })

  if (!day || day.completed) return

  const userProgram = day.week.userProgram
  const progress = userProgram.progress

  if (
    progress &&
    progress.currentWeek === day.week.weekIndex &&
    progress.currentDay === day.dayIndex
  ) {
    // Mark day as completed
    await tx.userProgramDay.update({
      where: { id: userProgramDayId },
      data: {
        completed: true,
        completedAt: new Date(),
        workoutLogId: workoutId,
      },
    })

    // Advance progress
    let nextDay = progress.currentDay + 1
    let nextWeek = progress.currentWeek

    if (nextDay >= 7) {
      nextDay = 0
      nextWeek++
    }

    if (nextWeek < userProgram.durationWeeks) {
      await tx.userProgramProgress.update({
        where: { id: progress.id },
        data: { currentDay: nextDay, currentWeek: nextWeek },
      })
    } else {
      await tx.userProgram.update({
        where: { id: userProgram.id },
        data: { status: 'completed' },
      })
    }
  }
}

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
    const existing = await prisma.workoutLog.findUnique({
      where: { clientId },
      select: workoutSelect,
    })
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
 * Fetches all workout logs for a user with pagination.
 */
export async function getAllWorkouts(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedWorkoutsResponse> {
  const skip = (page - 1) * limit

  try {
    const workouts = await prisma.workoutLog.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: workoutSelect,
    })

    const hasMore = workouts.length === limit
    return {
      workouts: workouts.map(formatWorkout),
      meta: { currentPage: page, limit, hasMore },
    }
  } catch (error) {
    throw new ApiError(500, 'Failed to fetch workouts')
  }
}

/**
 * Fetches public workouts for discovery.
 */
export async function getDiscoverWorkouts(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedWorkoutsResponse> {
  const skip = (page - 1) * limit

  try {
    const workouts = await prisma.workoutLog.findMany({
      where: {
        userId: { not: userId },
        deletedAt: null,
        visibility: 'public',
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: workoutSelect,
    })

    const hasMore = workouts.length === limit
    return {
      workouts: workouts.map(formatWorkout),
      meta: { currentPage: page, limit, hasMore },
    }
  } catch (error) {
    throw new ApiError(500, 'Failed to fetch discovery workouts')
  }
}

/**
 * Fetches a single workout by ID.
 */
export async function getWorkoutById(workoutId: string): Promise<Workout> {
  const workout = await prisma.workoutLog.findUnique({
    where: { id: workoutId },
    select: workoutSelect,
  })

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
  const workout = await prisma.workoutLog.findUnique({
    where: { shareId },
    select: workoutSelect,
  })

  if (!workout || workout.deletedAt || workout.visibility === 'private') {
    throw new ApiError(404, 'Shared workout not found')
  }

  return formatWorkout(workout)
}
