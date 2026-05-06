import type { Prisma } from '@prisma/client'

import { ApiError } from '../../utils/ApiError.js'
import { isValidCompletedSet } from '../../utils/workoutValidation.js'

import type { ExerciseGroupInput, ExerciseInput } from './types.js'

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

  for (const [, dbId] of groupIdMap) {
    if ((groupUsage.get(dbId) || 0) < 2) {
      droppedGroups++
      await tx.workoutLogExerciseGroup.delete({ where: { id: dbId } })
      await tx.workoutLogExercise.updateMany({
        where: { exerciseGroupId: dbId },
        data: { exerciseGroupId: null },
      })
    }
  }

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
