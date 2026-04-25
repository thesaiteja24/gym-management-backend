import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import * as habitService from './service.js'
import type { CreateHabitBody, LogHabitBody, UpdateHabitBody } from './types.js'

// FUNCTIONS

/**
 * Fetch all habits for a user.
 */
export const getHabits = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const habits = await habitService.getHabits(req.params.userId)
  return res.status(200).json(new ApiResponse(200, habits, 'Habits fetched successfully'))
})

/**
 * Create a new habit.
 */
export const createHabit = asyncHandler(
  async (req: Request<{ userId: string }, object, CreateHabitBody>, res: Response) => {
    const habit = await habitService.createHabit(req.params.userId, req.body)
    return res.status(201).json(new ApiResponse(201, habit, 'Habit created successfully'))
  },
)

/**
 * Update an existing habit.
 */
export const updateHabit = asyncHandler(
  async (req: Request<{ userId: string; id: string }, object, UpdateHabitBody>, res: Response) => {
    const habit = await habitService.updateHabit(req.params.id, req.body)
    return res.status(200).json(new ApiResponse(200, habit, 'Habit updated successfully'))
  },
)

/**
 * Delete a habit.
 */
export const deleteHabit = asyncHandler(
  async (req: Request<{ userId: string; id: string }>, res: Response) => {
    await habitService.deleteHabit(req.params.id)
    return res.status(200).json(new ApiResponse(200, null, 'Habit deleted successfully'))
  },
)

/**
 * Log progress for a specific habit.
 */
export const logHabit = asyncHandler(
  async (req: Request<{ userId: string; id: string }, object, LogHabitBody>, res: Response) => {
    const { date, value } = req.body
    const log = await habitService.logHabit(req.params.id, date, value)
    return res.status(200).json(new ApiResponse(200, log, 'Progress logged successfully'))
  },
)

/**
 * Fetch all processed habit logs (manual + system-tracked) for a user.
 */
export const getHabitLogs = asyncHandler(
  async (req: Request<{ userId: string }>, res: Response) => {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }
    const logsMap = await habitService.getProcessedHabitLogs(req.params.userId, startDate, endDate)
    return res.status(200).json(new ApiResponse(200, logsMap, 'Logs fetched successfully'))
  },
)
