import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as userService from './user.services.js'

// FUNCTIONS

export const getUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId
  const currentUserId = req.user?.id
  const user = await userService.getUserById(userId, currentUserId)

  return res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})

export const nudgeUser = asyncHandler(async (req: Request<{ userId: string }, object, { note?: string }>, res: Response) => {
  const userId = req.params.userId
  const currentUserId = req.user?.id
  const note = req.body?.note
 await userService.nudgeUser(userId, currentUserId, note)

  return res.status(200).json(new ApiResponse(200,null, 'User nudged successfully'))
})