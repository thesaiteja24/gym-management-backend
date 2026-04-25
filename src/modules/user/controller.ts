import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as userService from './service.js'

// FUNCTIONS

export const getUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId
  const user = await userService.getUserById(userId)

  return res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})
