import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import * as programService from './service.js'

// SECTION: PROGRAMS

/**
 * Creates a new program.
 */
export const createProgram = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const program = await programService.createProgram(userId, req.body)

  return res.json(new ApiResponse(200, { program }, 'Program created successfully'))
})

/**
 * Fetches all programs with pagination.
 */
export const getAllPrograms = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20

  const data = await programService.getAllPrograms(page, limit)

  return res.json(new ApiResponse(200, data, 'Programs fetched'))
})

/**
 * Fetches a single program by ID.
 */
export const getProgramById = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    const program = await programService.getProgramById(req.params.programId)
    return res.json(new ApiResponse(200, { program }, 'Program fetched'))
  },
)

/**
 * Updates an existing program.
 */
export const editProgram = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    const { programId } = req.params
    const userId = req.user!.id
    const updated = await programService.updateProgram(programId, userId, req.body)

    return res.json(new ApiResponse(200, { program: updated }, 'Program updated'))
  },
)

/**
 * Deletes a program.
 */
export const deleteProgram = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    await programService.deleteProgram(req.params.programId, req.user!.id)
    return res.json(new ApiResponse(200, null, 'Program deleted'))
  },
)

// SECTION: USER PROGRAMS

/**
 * Starts a program for the authenticated user.
 */
export const startProgram = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    const userId = req.user!.id
    const { programId } = req.params
    const { duration, startDate } = req.body

    const userProgram = await programService.startProgram(userId, programId, duration, startDate)

    return res.json(new ApiResponse(200, { userProgram }, 'Program started'))
  },
)

/**
 * Fetches a user program by ID, optionally for a specific week.
 */
export const getUserProgramById = asyncHandler(
  async (req: Request<{ userProgramId: string }>, res: Response) => {
    const userId = req.user!.id
    const { userProgramId } = req.params
    const requestedWeek = parseInt(req.query.weekIndex as string) || 0

    const program = await programService.getUserProgramById(userId, userProgramId, requestedWeek)

    return res.json(new ApiResponse(200, { program }, 'Program fetched'))
  },
)

/**
 * Fetches the active program for the user.
 */
export const getActiveUserProgram = asyncHandler(async (req: Request, res: Response) => {
  const program = await programService.getActiveUserProgram(req.user!.id)

  return res.json(new ApiResponse(200, { program }, 'Active program fetched'))
})

/**
 * Lists all programs the user is enrolled in.
 */
export const listUserPrograms = asyncHandler(async (req: Request, res: Response) => {
  const programs = await programService.listUserPrograms(req.user!.id)

  return res.json(new ApiResponse(200, { programs }, 'User programs fetched'))
})
