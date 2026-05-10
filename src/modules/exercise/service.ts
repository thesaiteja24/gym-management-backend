import { randomUUID } from 'crypto'

import { prisma, readPrisma } from '../../lib/prisma.js'
import { deleteCache, getCache, setCache } from '../../service/caching.service.js'
import type { UploadedFile } from '../../service/media.service.js'
import {
  deleteMediaByKey,
  extractS3KeyFromUrl,
  uploadExerciseVideo,
} from '../../service/media.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { titleizeString } from '../../utils/helpers.js'

import type { CreateExerciseBody, ExerciseResponse, UpdateExerciseBody } from './types.js'

// CONSTANTS


const GET_ALL_EXERCISES_CACHE_KEY = 'exercises:all'
const EXERCISES_CACHE_TTL = '365d'

const exerciseSelect = {
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
}

// QUERY HELPERS

/**
 * Flattens a Prisma exercise result by mapping otherMuscleGroups.
 */
export const flattenExercise = (ex: any): ExerciseResponse => ({
  ...ex,
  otherMuscleGroups: ex.otherMuscleGroups?.map((omg: any) => omg.muscleGroup) || [],
})

// FUNCTIONS

/**
 * Fetch all exercises.
 */
export async function getAllExercises(): Promise<ExerciseResponse[]> {
  const cached = await getCache<ExerciseResponse[]>(GET_ALL_EXERCISES_CACHE_KEY)
  if (cached) return cached

  const list = await readPrisma.exercise.findMany({
    orderBy: { title: 'asc' },
    include: exerciseSelect,
  })

  const flattened = list.map(flattenExercise)
  await setCache(GET_ALL_EXERCISES_CACHE_KEY, flattened, EXERCISES_CACHE_TTL)
  return flattened
}

/**
 * Fetch a single exercise by ID.
 */
export async function getExerciseById(id: string): Promise<ExerciseResponse> {
  const exercise = await readPrisma.exercise.findUnique({
    where: { id },
    include: exerciseSelect,
  })
  if (!exercise) throw new ApiError(404, 'Exercise not found')
  return flattenExercise(exercise)
}

/**
 * Create a new exercise.
 */
export async function createExercise(
  body: CreateExerciseBody,
  video: UploadedFile,
  userId: string,
): Promise<ExerciseResponse> {
  const filePath = `gym-sass/exercises/${randomUUID()}`
  const uploaded = await uploadExerciseVideo({ file: video, filePath, userId })

  try {
    const exercise = await prisma.exercise.create({
      data: {
        title: titleizeString(body.title),
        instructions: body.instructions,
        primaryMuscleGroupId: body.primaryMuscleGroupId,
        equipmentId: body.equipmentId,
        exerciseType: body.exerciseType,
        videoUrl: uploaded.videoUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        ...(body.otherMuscleGroupIds?.length && {
          otherMuscleGroups: {
            createMany: {
              data: body.otherMuscleGroupIds.map((id) => ({ muscleGroupId: id })),
            },
          },
        }),
      },
      include: exerciseSelect,
    })

    await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)
    return flattenExercise(exercise)
  } catch (_error) {
    await deleteMediaByKey({ key: uploaded.videoKey, userId, reason: 'DB failure' })
    await deleteMediaByKey({ key: uploaded.thumbnailKey, userId, reason: 'DB failure' })
    throw new ApiError(500, 'Failed to create exercise')
  }
}

/**
 * Update an existing exercise.
 */
export async function updateExercise(
  id: string,
  body: UpdateExerciseBody,
  video: UploadedFile | undefined,
  userId: string,
): Promise<ExerciseResponse> {
  const existing = await prisma.exercise.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Exercise not found')

  let uploaded: any = null
  if (video) {
    const filePath = `gym-sass/exercises/${randomUUID()}`
    uploaded = await uploadExerciseVideo({ file: video, filePath, userId })
  }

  try {
    const exercise = await prisma.$transaction(async (tx) => {
      const { otherMuscleGroupIds, ...rest } = body

      await tx.exercise.update({
        where: { id },
        data: {
          ...rest,
          title: body.title ? titleizeString(body.title) : undefined,
          ...(uploaded && {
            videoUrl: uploaded.videoUrl,
            thumbnailUrl: uploaded.thumbnailUrl,
          }),
        },
      })

      if (otherMuscleGroupIds) {
        await tx.exerciseMuscleGroup.deleteMany({ where: { exerciseId: id } })
        await tx.exerciseMuscleGroup.createMany({
          data: otherMuscleGroupIds.map((mid: string) => ({
            exerciseId: id,
            muscleGroupId: mid,
          })),
        })
      }

      return tx.exercise.findUnique({ where: { id }, include: exerciseSelect })
    })

    if (uploaded) {
      const oldV = extractS3KeyFromUrl(existing.videoUrl)
      const oldT = extractS3KeyFromUrl(existing.thumbnailUrl)
      if (oldV) await deleteMediaByKey({ key: oldV, userId, reason: 'replaced' })
      if (oldT) await deleteMediaByKey({ key: oldT, userId, reason: 'replaced' })
    }

    await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)
    return flattenExercise(exercise)
  } catch (_error) {
    if (uploaded) {
      await deleteMediaByKey({ key: uploaded.videoKey, userId, reason: 'DB failure' })
      await deleteMediaByKey({ key: uploaded.thumbnailKey, userId, reason: 'DB failure' })
    }
    throw new ApiError(500, 'Failed to update exercise')
  }
}

/**
 * Delete an exercise.
 */
export async function deleteExercise(id: string, userId: string): Promise<void> {
  const existing = await prisma.exercise.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Exercise not found')

  await prisma.exercise.delete({ where: { id } })

  const v = extractS3KeyFromUrl(existing.videoUrl)
  const t = extractS3KeyFromUrl(existing.thumbnailUrl)
  if (v) await deleteMediaByKey({ key: v, userId, reason: 'deleted' })
  if (t) await deleteMediaByKey({ key: t, userId, reason: 'deleted' })

  await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)
}
