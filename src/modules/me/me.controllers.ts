import { randomUUID } from 'crypto'

import type { Request, Response } from 'express'

import type { UploadedFile } from '../../service/media.service.js'
import {
  deleteMediaByKey,
  deleteProfilePicture,
  uploadMedia,
  uploadProfilePicture,
  uploadVideo,
} from '../../service/media.service.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as meService from './me.services.js'

// FUNCTIONS

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const user = await meService.getOwnProfile(userId)
  return res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const user = await meService.updateOwnProfile(userId, req.body)
  return res.status(200).json(new ApiResponse(200, user, 'Profile updated successfully'))
})

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  return res.status(200).json(new ApiResponse(200, null, 'User deleted (placeholder)'))
})

// FITNESS PROFILE

export const getFitnessProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const profile = await meService.getFitnessProfile(userId)
  return res.status(200).json(new ApiResponse(200, profile, 'Fitness profile fetched'))
})

export const updateFitnessProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const profile = await meService.updateFitnessProfile(userId, req.body)
  return res.status(200).json(new ApiResponse(200, profile, 'Fitness profile updated'))
})

// NUTRITION PLAN

export const getNutritionPlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const plan = await meService.getNutritionPlan(userId)
  return res.status(200).json(new ApiResponse(200, plan, 'Nutrition plan fetched'))
})

export const updateNutritionPlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const plan = await meService.updateNutritionPlan(userId, req.body)
  return res.status(200).json(new ApiResponse(200, plan, 'Nutrition plan updated'))
})

// MEASUREMENTS

export const getMeasurements = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const duration = (req.query.duration as string) || 'all'
  const startDate = meService.parseDurationToStartDate(duration)
  const payload = await meService.buildMeasurementPayload(userId, startDate)
  return res.status(200).json(new ApiResponse(200, payload, 'Measurements fetched'))
})

export const addMeasurements = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const measurement = await meService.processMeasurements(userId, req.body)
  return res.status(200).json(new ApiResponse(200, measurement, 'Measurements added'))
})

// ANALYTICS

export const getUserAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const analytics = await meService.getUserAnalytics(userId)
  return res.status(200).json(new ApiResponse(200, analytics, 'User analytics fetched'))
})

// MEDIA HANDLERS

export const updateMyProfilePic = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const file = req.file as UploadedFile
  const url = await uploadProfilePicture(file, userId)
  // Optionally update user record with URL
  await meService.updateOwnProfile(userId, { profilePicUrl: url } as any)
  return res.status(200).json(new ApiResponse(200, { url }, 'Profile picture uploaded'))
})

export const deleteMyProfilePic = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const user = await meService.getOwnProfile(userId)
  if (user.profilePicUrl) {
    await deleteProfilePicture(userId, user.profilePicUrl)
    await meService.updateOwnProfile(userId, { profilePicUrl: null } as any)
  }
  return res.status(200).json(new ApiResponse(200, null, 'Profile picture deleted'))
})

export const handleMediaUpload = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const file = req.file as UploadedFile
  const mediaType = (req.body.mediaType as string) || 'general'
  const url = await uploadMedia({
    file,
    mediaType,
    filePath: `gym-sass/${mediaType}/${randomUUID()}`,
    userId,
  })
  return res.status(200).json(new ApiResponse(200, { url }, 'Media uploaded'))
})

export const handleMediaDelete = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { key } = req.body as { key: string }
  await deleteMediaByKey({ key, userId, reason: 'user_request' })
  return res.status(200).json(new ApiResponse(200, null, 'Media deleted'))
})

export const handleVideoUpload = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const file = req.file as UploadedFile
  const mediaType = (req.body.mediaType as string) || 'workoutVideo'
  const result = await uploadVideo({
    file,
    mediaType,
    filePath: `gym-sass/videos/${randomUUID()}`,
    userId,
  })
  return res.status(200).json(new ApiResponse(200, result, 'Video uploaded'))
})
