import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { parseDurationToStartDate } from '../me/me.services.js'

import type { NudgeIntent } from './nudge.types.js'
import * as userService from './user.services.js'


// FUNCTIONS

export const getUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId
  const currentUserId = req.user?.id
  const user = await userService.getUserById(userId, currentUserId)

  return res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})

export const nudgeUser = asyncHandler(async (req: Request<{ userId: string }, object, { note?: string, intent?: NudgeIntent }>, res: Response) => {
  const userId = req.params.userId
  const currentUserId = req.user?.id
  const note = req.body?.note?.trim()
  const intent = req.body?.intent

  if (!currentUserId) {
    return res.status(401).json(new ApiResponse(401, null, 'Unauthorized'))
  }

  await userService.dispatchNudge(currentUserId, userId, intent, note)

  return res.status(200).json(new ApiResponse(200, null, 'User nudged successfully'))
})

export const getTopLifts = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 5
  const lifts = await userService.getTopLifts(userId, limit)

  return res.status(200).json(new ApiResponse(200, lifts, 'Top lifts fetched successfully'))
})

export const getTrainingAnalytics = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params
  const duration = (req.query.duration as string) || 'all'
  const startDate = parseDurationToStartDate(duration)
  const analytics = await userService.getTrainingAnalytics(userId, startDate)

  return res.status(200).json(new ApiResponse(200, analytics, 'Training analytics fetched successfully'))
})