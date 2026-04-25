import type { ExerciseGroupType, WorkoutLogVisibility } from '@prisma/client'

import { ApiError } from '../../common/utils/ApiError.js'
import type { WorkoutSet } from '../../common/utils/workoutValidation.js'
import { isValidCompletedSet } from '../../common/utils/workoutValidation.js'

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
    select: { id: true, groupType: true, groupIndex: true, restSeconds: true },
  },
  exercises: {
    orderBy: { exerciseIndex: 'asc' },
    select: {
      id: true,
      exerciseId: true,
      exerciseIndex: true,
      exerciseGroupId: true,
      exercise: { select: { id: true, title: true, thumbnailUrl: true, exerciseType: true } },
      sets: { orderBy: { setIndex: 'asc' } },
    },
  },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      profilePicUrl: true,
      isPro: true,
      proSubscriptionType: true,
    },
  },
} as const

export interface ExerciseInput {
  exerciseId: string
  exerciseIndex: number
  exerciseGroupId?: string
  sets: WorkoutSet[]
}
export interface ExerciseGroupInput {
  id: string
  groupType: ExerciseGroupType
  groupIndex: number
  restSeconds?: number
}

export interface CreateWorkoutBody {
  clientId?: string
  title?: string
  startTime: string
  endTime: string
  exercises: ExerciseInput[]
  exerciseGroups?: ExerciseGroupInput[]
  visibility?: WorkoutLogVisibility
  userProgramDayId?: string
}

export type UpdateWorkoutBody = CreateWorkoutBody

async function createExerciseGroups(tx: any, workoutId: string, groups: ExerciseGroupInput[]) {
  const map = new Map<string, string>()
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
    map.set(sorted[i].id, created.id)
  }
  return map
}

async function createExercisesWithSets(
  tx: any,
  workoutId: string,
  exercises: ExerciseInput[],
  groupIdMap: Map<string, string>,
) {
  let droppedSets = 0,
    droppedExercises = 0
  const persisted: any[] = []

  for (const ex of exercises) {
    const meta = await tx.exercise.findUnique({
      where: { id: ex.exerciseId },
      select: { exerciseType: true },
    })
    if (!meta) {
      droppedExercises++
      continue
    }

    const validSets = ex.sets.filter((s) => isValidCompletedSet(s, meta.exerciseType))
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
    persisted.push(workoutEx)
    await tx.workoutLogExerciseSet.createMany({
      data: validSets.map((s) => ({
        workoutExerciseId: workoutEx.id,
        ...s,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        rpe: s.rpe ?? null,
        durationSeconds: s.durationSeconds ?? null,
        restSeconds: s.restSeconds ?? null,
        note: s.note ?? null,
      })),
    })
  }
  return { persisted, droppedSets, droppedExercises }
}

async function pruneAndReindexGroups(
  tx: any,
  workoutId: string,
  persisted: any[],
  groupIdMap: Map<string, string>,
) {
  let droppedGroups = 0
  const usage = new Map<string, number>()
  persisted.forEach(
    (ex) =>
      ex.exerciseGroupId && usage.set(ex.exerciseGroupId, (usage.get(ex.exerciseGroupId) || 0) + 1),
  )

  for (const [, dbId] of groupIdMap) {
    if ((usage.get(dbId) || 0) < 2) {
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
    if (remaining[i].groupIndex !== i)
      await tx.workoutLogExerciseGroup.update({
        where: { id: remaining[i].id },
        data: { groupIndex: i },
      })
  }
  return droppedGroups
}

export async function processWorkoutTransaction(
  tx: any,
  workoutId: string,
  data: { exercises: ExerciseInput[]; exerciseGroups?: ExerciseGroupInput[] },
) {
  const groupIdMap = data.exerciseGroups
    ? await createExerciseGroups(tx, workoutId, data.exerciseGroups)
    : new Map<string, string>()
  const { persisted, droppedSets, droppedExercises } = await createExercisesWithSets(
    tx,
    workoutId,
    data.exercises,
    groupIdMap,
  )
  if (persisted.length === 0) throw new ApiError(400, 'No valid exercises')
  const droppedGroups = await pruneAndReindexGroups(tx, workoutId, persisted, groupIdMap)
  return { droppedSets, droppedExercises, droppedGroups }
}

export async function advanceProgramProgress(tx: any, userProgramDayId: string, workoutId: string) {
  const day = await tx.userProgramDay.findUnique({
    where: { id: userProgramDayId },
    include: { week: { include: { userProgram: { include: { progress: true } } } } },
  })
  if (!day || day.completed) return
  const prog = day.week.userProgram,
    p = prog.progress
  if (p && p.currentWeek === day.week.weekIndex && p.currentDay === day.dayIndex) {
    await tx.userProgramDay.update({
      where: { id: userProgramDayId },
      data: { completed: true, completedAt: new Date(), workoutLogId: workoutId },
    })
    let nDay = p.currentDay + 1,
      nWeek = p.currentWeek
    if (nDay >= 7) {
      nDay = 0
      nWeek++
    }
    if (nWeek < prog.durationWeeks)
      await tx.userProgramProgress.update({
        where: { id: p.id },
        data: { currentDay: nDay, currentWeek: nWeek },
      })
    else
      await tx.userProgram.update({
        where: { id: day.week.userProgramId },
        data: { status: 'completed' },
      })
  }
}
