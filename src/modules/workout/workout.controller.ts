import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { ApiError } from '../../utils/ApiError.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { generateSecureToken } from '../../utils/helpers.js'

import type { CreateWorkoutBody, UpdateWorkoutBody } from './workout.service.js'
import * as workoutService from './workout.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createWorkout = asyncHandler(
  async (req: Request<Record<string, never>, object, CreateWorkoutBody>, res: Response) => {
    const {
      clientId,
      title,
      startTime,
      endTime,
      exercises,
      exerciseGroups,
      visibility,
      userProgramDayId,
    } = req.body

    if (clientId) {
      const existing = await prisma.workoutLog.findUnique({ where: { clientId } })
      if (existing) {
        return res.json(
          new ApiResponse(200, { workout: existing }, 'Workout already created (Idempotent)'),
        )
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
            userId: req.user!.id,
            clientId,
            title,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            visibility,
            shareId: generateSecureToken(),
          },
        })
        workoutId = workout.id

        const result = await workoutService.processWorkoutTransaction(tx, workoutId, {
          exercises,
          exerciseGroups,
        })
        droppedSets = result.droppedSets
        droppedExercises = result.droppedExercises
        droppedGroups = result.droppedGroups

        if (userProgramDayId) {
          await workoutService.advanceProgramProgress(tx, userProgramDayId, workoutId)
        }
      })
    } catch (_error) {
      throw _error instanceof ApiError ? _error : new ApiError(500, 'Failed to create workout')
    }

    const fullWorkout = await prisma.workoutLog.findUnique({
      where: { id: workoutId! },
      select: workoutService.workoutSelect,
    })

    return res.json(
      new ApiResponse(
        201,
        {
          workout: fullWorkout || { id: workoutId! },
          meta: { droppedSets, droppedExercises, droppedGroups },
        },
        'Workout created successfully',
      ),
    )
  },
)

export const getAllWorkouts = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const skip = (page - 1) * limit

  try {
    const workouts = await prisma.workoutLog.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: workoutService.workoutSelect,
    })

    const hasMore = workouts.length === limit
    return res.json(
      new ApiResponse(
        200,
        { workouts, meta: { currentPage: page, limit, hasMore } },
        'Workouts fetched successfully',
      ),
    )
  } catch (_error) {
    throw new ApiError(500, 'Failed to fetch workouts')
  }
})

export const getDiscoverWorkouts = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const skip = (page - 1) * limit

  try {
    const workouts = await prisma.workoutLog.findMany({
      where: { userId: { not: userId }, deletedAt: null, visibility: 'public' },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: workoutService.workoutSelect,
    })

    const hasMore = workouts.length === limit
    return res.json(
      new ApiResponse(
        200,
        { workouts, meta: { currentPage: page, limit, hasMore } },
        'Workouts fetched successfully',
      ),
    )
  } catch (_error) {
    throw new ApiError(500, 'Failed to fetch workouts')
  }
})

export const getWorkoutById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const workoutId = req.params.id
  const workout = await prisma.workoutLog.findFirst({
    where: { id: workoutId },
    select: workoutService.workoutSelect,
  })

  if (!workout) throw new ApiError(404, 'Workout not found')
  return res.json(new ApiResponse(200, workout, 'Workout fetched successfully'))
})

export const deleteWorkout = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const workoutId = req.params.id
  const userId = req.user!.id

  const workout = await prisma.workoutLog.findUnique({ where: { id: workoutId } })
  if (!workout || workout.userId !== userId) throw new ApiError(404, 'Workout not found')

  await prisma.workoutLog.update({
    where: { id: workoutId },
    data: { deletedAt: new Date() },
  })

  return res.json(new ApiResponse(200, null, 'Workout deleted successfully'))
})

export const updateWorkout = asyncHandler(
  async (req: Request<{ id: string }, object, UpdateWorkoutBody>, res: Response) => {
    const workoutId = req.params.id
    const userId = req.user!.id
    const { title, startTime, endTime, exercises, exerciseGroups, visibility } = req.body

    let droppedSets = 0
    let droppedExercises = 0
    let droppedGroups = 0

    try {
      await prisma.$transaction(async (tx) => {
        const existingWorkout = await tx.workoutLog.findUnique({ where: { id: workoutId } })
        if (!existingWorkout || existingWorkout.userId !== userId)
          throw new ApiError(404, 'Workout not found')
        if (existingWorkout.deletedAt) throw new ApiError(400, 'Cannot update deleted workout')

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
            shareId: existingWorkout.shareId || generateSecureToken(),
          },
        })

        const result = await workoutService.processWorkoutTransaction(tx, workoutId, {
          exercises,
          exerciseGroups,
        })
        droppedSets = result.droppedSets
        droppedExercises = result.droppedExercises
        droppedGroups = result.droppedGroups
      })
    } catch (_error) {
      throw _error instanceof ApiError ? _error : new ApiError(500, 'Failed to update workout')
    }

    const updatedWorkout = await prisma.workoutLog.findUnique({
      where: { id: workoutId },
      select: workoutService.workoutSelect,
    })

    return res.json(
      new ApiResponse(
        200,
        { workout: updatedWorkout, meta: { droppedSets, droppedExercises, droppedGroups } },
        'Workout updated successfully',
      ),
    )
  },
)

export const getWorkoutByShareId = asyncHandler(
  async (req: Request<{ id: string }>, res: Response) => {
    const shareId = req.params.id
    const workout = await prisma.workoutLog.findUnique({
      where: { shareId },
      select: workoutService.workoutSelect,
    })

    if (!workout || workout.deletedAt || workout.visibility === 'private') {
      throw new ApiError(404, 'Shared workout not found')
    }

    return res.json(new ApiResponse(200, workout, 'Workout fetched successfully'))
  },
)
