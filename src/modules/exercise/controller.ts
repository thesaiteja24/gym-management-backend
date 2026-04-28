import type { Request, Response } from 'express'

import type { UploadedFile } from '../../service/media.service.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as exerciseService from './service.js'
import type { CreateExerciseBody, UpdateExerciseBody } from './types.js'

// FUNCTIONS

/**
 * Fetch all exercises.
 */
export const getAllExercises = asyncHandler(async (req: Request, res: Response) => {
  const exercises = await exerciseService.getAllExercises()
  return res.status(200).json(new ApiResponse(200, exercises, 'Exercises fetched successfully'))
})

/**
 * Fetch a single exercise by ID.
 */
export const getExerciseById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const exercise = await exerciseService.getExerciseById(req.params.id)
  return res.status(200).json(new ApiResponse(200, exercise, 'Exercise fetched successfully'))
})

/**
 * Create a new exercise.
 */
export const createExercise = asyncHandler(
  async (req: Request<object, object, CreateExerciseBody>, res: Response) => {
    const video = req.file as UploadedFile
    const exercise = await exerciseService.createExercise(req.body, video, req.user!.id)
    return res.status(201).json(new ApiResponse(201, exercise, 'Exercise created successfully'))
  },
)

/**
 * Update an existing exercise.
 */
export const updateExercise = asyncHandler(
  async (req: Request<{ id: string }, object, UpdateExerciseBody>, res: Response) => {
    const video = req.file as UploadedFile | undefined
    const exercise = await exerciseService.updateExercise(
      req.params.id,
      req.body,
      video,
      req.user!.id,
    )
    return res.status(200).json(new ApiResponse(200, exercise, 'Exercise updated successfully'))
  },
)

/**
 * Delete an exercise.
 */
export const deleteExercise = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await exerciseService.deleteExercise(req.params.id, req.user!.id)
  return res.status(200).json(new ApiResponse(200, null, 'Exercise deleted successfully'))
})
