import type { SetType, ExerciseGroupType } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { FREE_LIMITS } from '../../common/constants/limits.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { generateSecureToken } from '../../common/utils/helpers.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export interface TemplateSetInput {
  setIndex: number
  setType: SetType
  weight?: number | null
  reps?: number | null
  rpe?: number | null
  durationSeconds?: number | null
  restSeconds?: number | null
  note?: string | null
}

export interface TemplateExerciseInput {
  exerciseId: string
  exerciseIndex: number
  exerciseGroupId?: string
  sets: TemplateSetInput[]
}

export interface TemplateExerciseGroupInput {
  id: string
  groupType: ExerciseGroupType
  groupIndex: number
  restSeconds?: number
}

export interface CreateTemplateData {
  title: string
  notes?: string
  exercises: TemplateExerciseInput[]
  exerciseGroups?: TemplateExerciseGroupInput[]
  sourceShareId?: string
}

async function createTemplateChildren(
  tx: any,
  templateId: string,
  exercises: TemplateExerciseInput[],
  exerciseGroups?: TemplateExerciseGroupInput[],
) {
  const groupIdMap = new Map<string, string>()

  if (Array.isArray(exerciseGroups) && exerciseGroups.length > 0) {
    const normalized = [...exerciseGroups]
      .sort((a, b) => a.groupIndex - b.groupIndex)
      .map((g, i) => ({ ...g, normalizedIndex: i }))
    for (const group of normalized) {
      const created = await tx.workoutTemplateExerciseGroup.create({
        data: {
          templateId,
          groupType: group.groupType,
          groupIndex: group.normalizedIndex,
          restSeconds: group.restSeconds ?? null,
        },
      })
      groupIdMap.set(group.id, created.id)
    }
  }

  for (const exercise of exercises) {
    const templateExercise = await tx.workoutTemplateExercise.create({
      data: {
        templateId,
        exerciseId: exercise.exerciseId,
        exerciseIndex: exercise.exerciseIndex,
        exerciseGroupId: exercise.exerciseGroupId
          ? (groupIdMap.get(exercise.exerciseGroupId) ?? null)
          : null,
      },
    })

    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      await tx.workoutTemplateSet.createMany({
        data: exercise.sets.map((set) => ({
          templateExerciseId: templateExercise.id,
          setIndex: set.setIndex,
          setType: set.setType,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          rpe: set.rpe ?? null,
          durationSeconds: set.durationSeconds ?? null,
          restSeconds: set.restSeconds ?? null,
          note: set.note ?? null,
        })),
      })
    }
  }
}

export async function processCreateTemplate(userId: string, data: CreateTemplateData) {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, isPro: true },
    })
    if (!user?.isPro) {
      const count = await tx.workoutTemplate.count({ where: { userId } })
      if (count >= FREE_LIMITS.MAX_CUSTOM_TEMPLATES) {
        throw new ApiError(
          403,
          `Free plan limit reached (${FREE_LIMITS.MAX_CUSTOM_TEMPLATES} templates).`,
        )
      }
    }

    const authorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown'
    const template = await tx.workoutTemplate.create({
      data: {
        userId,
        title: data.title,
        notes: data.notes,
        shareId: generateSecureToken(),
        sourceShareId: data.sourceShareId ?? null,
        authorName,
      },
    })

    await createTemplateChildren(tx, template.id, data.exercises, data.exerciseGroups)
    return template
  })
}

export async function processUpdateTemplate(
  userId: string,
  templateId: string,
  data: CreateTemplateData,
) {
  return await prisma.$transaction(async (tx) => {
    const template = await tx.workoutTemplate.findUnique({ where: { id: templateId } })
    if (!template || template.userId !== userId || template.deletedAt)
      throw new ApiError(404, 'Template not found')

    await tx.workoutTemplateExercise.deleteMany({ where: { templateId } })
    await tx.workoutTemplateExerciseGroup.deleteMany({ where: { templateId } })

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    })
    const authorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown'

    await tx.workoutTemplate.update({
      where: { id: templateId },
      data: {
        title: data.title,
        notes: data.notes,
        authorName: template.authorName || authorName,
        shareId: template.shareId || generateSecureToken(),
      },
    })

    await createTemplateChildren(tx, templateId, data.exercises, data.exerciseGroups)

    return tx.workoutTemplate.findUnique({
      where: { id: templateId },
      include: {
        exerciseGroups: { orderBy: { groupIndex: 'asc' } },
        exercises: {
          orderBy: { exerciseIndex: 'asc' },
          include: {
            sets: { orderBy: { setIndex: 'asc' } },
            exercise: { select: { id: true, title: true, thumbnailUrl: true, exerciseType: true } },
          },
        },
      },
    })
  })
}
