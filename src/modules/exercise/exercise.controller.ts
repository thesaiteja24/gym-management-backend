import { randomUUID } from 'crypto'

import { PrismaClient } from '@prisma/client'
import type { ExerciseType } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { deleteCache, getCache, setCache } from '../../service/caching.service.js'
import type { UploadedFile } from '../../service/media.service.js'
import {
  deleteMediaByKey,
  extractS3KeyFromUrl,
  uploadExerciseVideo,
} from '../../service/media.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { titleizeString } from '../../utils/helpers.js'

const prisma = new PrismaClient().$extends(withAccelerate())
const GET_ALL_EXERCISES_CACHE_KEY = 'exercises:all'
const EXERCISES_CACHE_TTL = '365d'

interface CreateExerciseBody {
  title: string
  instructions: string
  primaryMuscleGroupId: string
  equipmentId: string
  exerciseType: ExerciseType
  otherMuscleGroupIds?: string[]
}

type UpdateExerciseBody = Partial<CreateExerciseBody>

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

const flattenExercise = (ex: any) => ({
  ...ex,
  otherMuscleGroups: ex.otherMuscleGroups?.map((omg: any) => omg.muscleGroup) || [],
})

async function handleMediaUpload(file: UploadedFile, userId: string) {
  const filePath = `gym-sass/exercises/${randomUUID()}`
  return await uploadExerciseVideo({ file, filePath, userId })
}

export const createExercise = asyncHandler(
  async (req: Request<object, object, CreateExerciseBody>, res: Response) => {
    const {
      title,
      instructions,
      primaryMuscleGroupId,
      equipmentId,
      exerciseType,
      otherMuscleGroupIds,
    } = req.body
    const video = req.file as UploadedFile
    const uploaded = await handleMediaUpload(video, req.user!.id)

    try {
      const exercise = await prisma.exercise.create({
        data: {
          title: titleizeString(title),
          instructions,
          primaryMuscleGroupId,
          equipmentId,
          exerciseType,
          videoUrl: uploaded.videoUrl,
          thumbnailUrl: uploaded.thumbnailUrl,
          ...(otherMuscleGroupIds?.length && {
            otherMuscleGroups: {
              createMany: { data: otherMuscleGroupIds.map((id) => ({ muscleGroupId: id })) },
            },
          }),
        },
        include: exerciseSelect,
      })
      await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)
      return res.json(new ApiResponse(200, flattenExercise(exercise), 'Exercise created'))
    } catch (_error) {
      await deleteMediaByKey({ key: uploaded.videoKey, userId: req.user!.id, reason: 'DB failure' })
      await deleteMediaByKey({
        key: uploaded.thumbnailKey,
        userId: req.user!.id,
        reason: 'DB failure',
      })
      throw new ApiError(500, 'Failed to create exercise')
    }
  },
)

export const getAllExercises = asyncHandler(async (req: Request, res: Response) => {
  const cached = await getCache<any[]>(GET_ALL_EXERCISES_CACHE_KEY)
  if (cached) return res.json(new ApiResponse(200, cached, 'Exercises fetched (cache)'))

  const list = await prisma.exercise.findMany({
    orderBy: { title: 'asc' },
    include: exerciseSelect,
  })
  const flattened = list.map(flattenExercise)
  await setCache(GET_ALL_EXERCISES_CACHE_KEY, flattened, EXERCISES_CACHE_TTL)
  return res.json(new ApiResponse(200, flattened, 'Exercises fetched'))
})

export const getExerciseById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const exercise = await prisma.exercise.findUnique({
    where: { id: req.params.id },
    include: exerciseSelect,
  })
  if (!exercise) throw new ApiError(404, 'Exercise not found')
  return res.json(new ApiResponse(200, flattenExercise(exercise), 'Exercise fetched'))
})

export const updateExercise = asyncHandler(
  async (req: Request<{ id: string }, object, UpdateExerciseBody>, res: Response) => {
    const { id } = req.params
    const existing = await prisma.exercise.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Exercise not found')

    const video = req.file as UploadedFile | undefined
    const uploaded = video ? await handleMediaUpload(video, req.user!.id) : null

    try {
      const exercise = await prisma.$transaction(async (tx) => {
        await tx.exercise.update({
          where: { id },
          data: {
            ...req.body,
            title: req.body.title ? titleizeString(req.body.title) : undefined,
            ...(uploaded && { videoUrl: uploaded.videoUrl, thumbnailUrl: uploaded.thumbnailUrl }),
          },
        })
        if (req.body.otherMuscleGroupIds) {
          await tx.exerciseMuscleGroup.deleteMany({ where: { exerciseId: id } })
          await tx.exerciseMuscleGroup.createMany({
            data: req.body.otherMuscleGroupIds.map((mid: string) => ({
              exerciseId: id,
              muscleGroupId: mid,
            })),
          })
        }
        return tx.exercise.findUnique({ where: { id }, include: exerciseSelect })
      })

      if (uploaded) {
        const oldV = extractS3KeyFromUrl(existing.videoUrl),
          oldT = extractS3KeyFromUrl(existing.thumbnailUrl)
        if (oldV) await deleteMediaByKey({ key: oldV, userId: req.user!.id, reason: 'replaced' })
        if (oldT) await deleteMediaByKey({ key: oldT, userId: req.user!.id, reason: 'replaced' })
      }
      await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)
      return res.json(new ApiResponse(200, flattenExercise(exercise), 'Exercise updated'))
    } catch (_error) {
      if (uploaded) {
        await deleteMediaByKey({
          key: uploaded.videoKey,
          userId: req.user!.id,
          reason: 'DB failure',
        })
        await deleteMediaByKey({
          key: uploaded.thumbnailKey,
          userId: req.user!.id,
          reason: 'DB failure',
        })
      }
      throw new ApiError(500, 'Failed to update exercise')
    }
  },
)

export const deleteExercise = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const existing = await prisma.exercise.findUnique({ where: { id: req.params.id } })
  if (!existing) throw new ApiError(404, 'Exercise not found')

  await prisma.exercise.delete({ where: { id: req.params.id } })
  const v = extractS3KeyFromUrl(existing.videoUrl),
    t = extractS3KeyFromUrl(existing.thumbnailUrl)
  if (v) await deleteMediaByKey({ key: v, userId: req.user!.id, reason: 'deleted' })
  if (t) await deleteMediaByKey({ key: t, userId: req.user!.id, reason: 'deleted' })
  await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)
  return res.json(new ApiResponse(200, null, 'Exercise deleted'))
})
