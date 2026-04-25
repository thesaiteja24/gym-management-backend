import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'

import * as habitService from './habit.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const getHabits = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const habits = await prisma.habit.findMany({
    where: { userId: req.params.userId },
    orderBy: { createdAt: 'asc' },
  })
  return res.status(200).json(new ApiResponse(200, habits, 'Habits fetched'))
})

export const createHabit = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params
  if (req.body.internalMetricId) {
    const existing = await prisma.habit.findFirst({
      where: { userId, internalMetricId: req.body.internalMetricId },
    })
    if (existing) throw new ApiError(400, 'Already tracking this metric')
  }
  const habit = await prisma.habit.create({ data: { ...req.body, userId } })
  return res.status(201).json(new ApiResponse(201, habit, 'Habit created'))
})

export const updateHabit = asyncHandler(
  async (req: Request<{ userId: string; id: string }>, res: Response) => {
    const habit = await prisma.habit.update({ where: { id: req.params.id }, data: req.body })
    return res.status(200).json(new ApiResponse(200, habit, 'Habit updated'))
  },
)

export const deleteHabit = asyncHandler(
  async (req: Request<{ userId: string; id: string }>, res: Response) => {
    await prisma.habit.delete({ where: { id: req.params.id } })
    return res.status(200).json(new ApiResponse(200, null, 'Habit deleted'))
  },
)

export const logHabit = asyncHandler(
  async (req: Request<{ userId: string; id: string }>, res: Response) => {
    const { id } = req.params
    const { date, value } = req.body
    const d = new Date(date)
    d.setUTCHours(0, 0, 0, 0)

    const log = await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: id, date: d } },
      update: { value },
      create: { habitId: id, date: d, value },
    })
    return res.status(200).json(new ApiResponse(200, log, 'Progress logged'))
  },
)

export const getHabitLogs = asyncHandler(
  async (req: Request<{ userId: string }>, res: Response) => {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string }
    const logsMap = await habitService.processHabitLogs(req.params.userId, startDate, endDate)
    return res.status(200).json(new ApiResponse(200, logsMap, 'Logs fetched'))
  },
)
