import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as workoutService from './workout.services.js'
import type { CreateWorkoutBody, UpdateWorkoutBody } from './types.js'

/**
 * Creates a new workout log.
 */
export const createWorkout = asyncHandler(
  async (req: Request<Record<string, never>, object, CreateWorkoutBody>, res: Response) => {
    const response = await workoutService.createWorkout(req.user!.id, req.body)
    return res.status(201).json(new ApiResponse(201, response, 'Workout created successfully'))
  },
)

/**
 * Fetches workout logs based on query (personal history, user history, or discovery).
 */
export const listWorkouts = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const userId = req.query.userId as string | undefined

  const response = await workoutService.listWorkouts(req.user!.id, {
    page,
    limit,
    userId,
  })
  return res.json(new ApiResponse(200, response, 'Workouts fetched successfully'))
})

/**
 * Fetches a single workout by ID.
 */
export const getWorkoutById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const workout = await workoutService.getWorkoutById(req.params.id)
  return res.json(new ApiResponse(200, workout, 'Workout fetched successfully'))
})

/**
 * Soft deletes a workout log.
 */
export const deleteWorkout = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await workoutService.deleteWorkout(req.user!.id, req.params.id)
  return res.json(new ApiResponse(200, null, 'Workout deleted successfully'))
})

/**
 * Updates an existing workout log.
 */
export const updateWorkout = asyncHandler(
  async (req: Request<{ id: string }, object, UpdateWorkoutBody>, res: Response) => {
    const response = await workoutService.updateWorkout(req.user!.id, req.params.id, req.body)
    return res.json(new ApiResponse(200, response, 'Workout updated successfully'))
  },
)

/**
 * Fetches a workout by its public share ID.
 */
export const getWorkoutByShareId = asyncHandler(
  async (req: Request<{ id: string }>, res: Response) => {
    const workout = await workoutService.getWorkoutByShareId(req.params.id)
    return res.json(new ApiResponse(200, workout, 'Shared workout fetched successfully'))
  },
)
