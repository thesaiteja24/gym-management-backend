import { randomUUID } from 'crypto'

import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import type { UploadedFile } from '../../common/services/media.service.js'
import {
  deleteMediaByKey,
  deleteProfilePicture,
  extractS3KeyFromUrl,
  uploadMedia,
  uploadProfilePicture,
  uploadVideo,
} from '../../common/services/media.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { selfUserSelect, formatUserResponse } from '../user/user.controller.js'

import * as meService from './me.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw new ApiError(401, 'Unauthorized')
  const user = await prisma.user.findUnique({ where: { id: userId }, select: selfUserSelect })
  if (!user) throw new ApiError(404, 'User not found')
  return res.json(new ApiResponse(200, formatUserResponse(user), 'User fetched successfully'))
})

export const getFitnessProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const profile = await prisma.userFitnessProfile.findUnique({ where: { userId } })
  const formatted = {
    ...profile,
    targetWeight: profile?.targetWeight?.toNumber() || null,
    targetBodyFat: profile?.targetBodyFat?.toNumber() || null,
    weeklyWeightChange: profile?.weeklyWeightChange?.toNumber() || null,
  }
  return res.json(new ApiResponse(200, formatted, 'Fitness profile fetched successfully'))
})

export const getMeasurements = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const duration = (req.query.duration as string) || '3m'
  const startDate = meService.parseDurationToStartDate(duration)
  const payload = await meService.buildMeasurementPayload(userId, startDate)
  return res.json(new ApiResponse(200, payload, 'Measurements fetched successfully'))
})

export const getNutritionPlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const plan = await prisma.userNutritionPlan.findUnique({ where: { userId } })
  return res.json(new ApiResponse(200, plan, 'Nutrition plan fetched successfully'))
})

export const getUserAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const analytics = await meService.getUserAnalytics(userId)
  return res.json(new ApiResponse(200, analytics, 'User analytics fetched successfully'))
})

export const getTrainingAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const duration = (req.query.duration as string) || '1m'
  const startDate = meService.parseDurationToStartDate(duration)

  const logs = await prisma.workoutLog.findMany({
    where: { userId, deletedAt: null, ...(startDate ? { startTime: { gte: startDate } } : {}) },
    include: {
      exercises: {
        include: {
          exercise: { select: { exerciseType: true } },
          sets: { where: { setType: { not: 'warmup' } } },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  const volumeMap = new Map<string, number>(),
    durationMap = new Map<string, number>(),
    repsMap = new Map<string, number>()
  logs.forEach((w) => {
    if (!w.startTime) return
    const key = w.startTime.toISOString().split('T')[0]
    let v = 0,
      r = 0,
      d = 0
    if (w.endTime) d = Math.floor((w.endTime.getTime() - w.startTime.getTime()) / 1000)
    w.exercises.forEach((ex) =>
      ex.sets.forEach((s) => {
        if (ex.exercise.exerciseType === 'weighted' || ex.exercise.exerciseType === 'assisted')
          v += (Number(s.weight) || 0) * (s.reps || 0)
        r += s.reps || 0
      }),
    )
    volumeMap.set(key, (volumeMap.get(key) || 0) + v)
    durationMap.set(key, (durationMap.get(key) || 0) + d)
    repsMap.set(key, (repsMap.get(key) || 0) + r)
  })

  const format = (m: Map<string, number>) =>
    Array.from(m.entries()).map(([date, value]) => ({ date, value }))
  return res.json(
    new ApiResponse(
      200,
      { volume: format(volumeMap), duration: format(durationMap), reps: format(repsMap) },
      'Training metrics fetched',
    ),
  )
})

export const getStrengthTrend = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const duration = (req.query.duration as string) || '1m'
  const top = Number(req.query.top) || 4
  const startDate = meService.parseDurationToStartDate(duration)

  const workouts = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
      startTime: { not: null, ...(startDate ? { gte: startDate } : {}) },
    },
    include: {
      exercises: {
        include: {
          exercise: { select: { title: true, exerciseType: true } },
          sets: { where: { setType: { not: 'warmup' } } },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  const exerciseScores = new Map<
    string,
    { title: string; points: { ts: number; score: number }[] }
  >()
  workouts.forEach((w) => {
    const ts = w.startTime!.getTime()
    w.exercises.forEach((ex) => {
      const score = meService.getExerciseWorkoutScore(ex.exercise.exerciseType, ex.sets)
      if (score === null) return
      if (!exerciseScores.has(ex.exerciseId))
        exerciseScores.set(ex.exerciseId, { title: ex.exercise.title, points: [] })
      exerciseScores.get(ex.exerciseId)!.points.push({ ts, score })
    })
  })

  const trends: any[] = []
  exerciseScores.forEach((data, id) => {
    const scores = data.points.sort((a, b) => a.ts - b.ts).map((p) => p.score)
    const window = Math.min(3, Math.ceil(scores.length / 2))
    const start = meService.average(scores.slice(0, window)),
      end = meService.average(scores.slice(-window))
    const change = start > 0 ? ((end - start) / start) * 100 : 0
    let trend = 'flat'
    if (Math.abs(change) >= 2) trend = change > 0 ? 'up' : 'down'
    trends.push({ exerciseId: id, title: data.title, trend, changePct: Number(change.toFixed(2)) })
  })

  const result = {
    gaining: trends
      .filter((t) => t.trend === 'up')
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, top),
    losing: trends
      .filter((t) => t.trend === 'down')
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, top),
    plateauing: trends
      .filter((t) => t.trend === 'flat')
      .sort((a, b) => Math.abs(a.changePct) - Math.abs(b.changePct))
      .slice(0, top),
  }

  return res.json(new ApiResponse(200, result, 'Strength trend fetched'))
})

export const addMeasurements = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { date, weight, ...measurements } = req.body
  const parsedDate = new Date(date)
  parsedDate.setUTCHours(0, 0, 0, 0)

  const files = req.files as Express.Multer.File[] | undefined
  const progressPicUrls: string[] = []
  const uploadedKeys: string[] = []

  if (files?.length) {
    try {
      for (const file of files) {
        const filePath = `gym-sass/measurements/${userId}/${randomUUID()}`
        const url = file.mimetype.startsWith('video/')
          ? (await uploadVideo({ file, mediaType: 'progressVideo', filePath, userId })).videoUrl
          : await uploadMedia({ file, mediaType: 'progressPic', filePath, userId })
        progressPicUrls.push(url)
        const key = extractS3KeyFromUrl(url)
        if (key) uploadedKeys.push(key)
      }
    } catch (_error) {
      for (const key of uploadedKeys)
        await deleteMediaByKey({ key, userId, reason: 'Failed upload' })
      throw new ApiError(500, 'Failed to upload media')
    }
  }

  try {
    await prisma.$transaction([
      prisma.userMeasurement.upsert({
        where: { userId_date: { userId, date: parsedDate } },
        update: {
          ...measurements,
          weight,
          ...(progressPicUrls.length && { progressPicUrls: { push: progressPicUrls } }),
        },
        create: { userId, date: parsedDate, weight, ...measurements, progressPicUrls },
      }),
      ...(weight !== undefined
        ? [prisma.user.update({ where: { id: userId }, data: { weight } })]
        : []),
    ])
    const payload = await meService.buildMeasurementPayload(userId)
    return res.json(new ApiResponse(200, payload, 'Measurements saved'))
  } catch (_error) {
    for (const key of uploadedKeys) await deleteMediaByKey({ key, userId, reason: 'DB failure' })
    throw new ApiError(500, 'Failed to save measurements')
  }
})

export const updateFitnessProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const updates = req.body
  const profile = await prisma.userFitnessProfile.upsert({
    where: { userId },
    update: {
      ...updates,
      targetDate: updates.targetDate ? new Date(updates.targetDate) : undefined,
    },
    create: {
      userId,
      ...updates,
      targetDate: updates.targetDate ? new Date(updates.targetDate) : undefined,
    },
  })
  const formatted = {
    ...profile,
    targetWeight: profile.targetWeight?.toNumber() || null,
    targetBodyFat: profile.targetBodyFat?.toNumber() || null,
    weeklyWeightChange: profile.weeklyWeightChange?.toNumber() || null,
  }
  return res.json(new ApiResponse(200, formatted, 'Fitness profile updated'))
})

export const updateNutritionPlan = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const updates = req.body
  const plan = await prisma.userNutritionPlan.upsert({
    where: { userId },
    update: { ...updates, startDate: updates.startDate ? new Date(updates.startDate) : undefined },
    create: {
      userId,
      ...updates,
      startDate: updates.startDate ? new Date(updates.startDate) : new Date(),
    },
  })
  return res.json(new ApiResponse(200, plan, 'Nutrition plan updated'))
})

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const updates = req.body
  const user = await prisma.user.update({
    where: { id: userId },
    select: selfUserSelect,
    data: {
      ...updates,
      dateOfBirth: updates.dateOfBirth ? new Date(updates.dateOfBirth) : undefined,
    },
  })
  return res.json(new ApiResponse(200, formatUserResponse(user), 'Me updated'))
})

export const updateMyProfilePic = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const file = req.file as UploadedFile | undefined
  if (!file) throw new ApiError(400, 'No file')

  const oldUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePicUrl: true },
  })
  const newUrl = await uploadProfilePicture(file, userId)
  const user = await prisma.user.update({
    where: { id: userId },
    select: selfUserSelect,
    data: { profilePicUrl: newUrl },
  })
  if (oldUser?.profilePicUrl) await deleteProfilePicture(userId, oldUser.profilePicUrl)
  return res.json(new ApiResponse(200, formatUserResponse(user), 'Profile pic updated'))
})

export const deleteMyProfilePic = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePicUrl: true },
  })
  if (user?.profilePicUrl) await deleteProfilePicture(userId, user.profilePicUrl)
  const updated = await prisma.user.update({
    where: { id: userId },
    select: selfUserSelect,
    data: { profilePicUrl: null },
  })
  return res.json(new ApiResponse(200, formatUserResponse(updated), 'Profile pic deleted'))
})
