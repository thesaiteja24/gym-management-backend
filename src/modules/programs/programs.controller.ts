import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { formatCompactNumber } from '../../common/utils/helpers.js'

import * as programService from './programs.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

const standardProgramSelect = {
  id: true,
  title: true,
  description: true,
  experienceLevel: true,
  createdBy: true,
}

export const createProgram = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { clientId, title, description, experienceLevel, durationOptions, weeks } = req.body

  const existing = await prisma.program.findUnique({ where: { clientId } })
  if (existing) return res.json(new ApiResponse(200, existing, 'Program already created'))

  const templateIds = [
    ...new Set(
      weeks
        .flatMap((w: any) => w.days)
        .map((d: any) => d.templateId)
        .filter(Boolean),
    ),
  ]
  if (templateIds.length) {
    const found = await prisma.workoutTemplate.count({
      where: { id: { in: templateIds as string[] }, deletedAt: null, userId },
    })
    if (found !== templateIds.length)
      throw new ApiError(404, 'Some templates are invalid or unauthorized')
  }

  const program = await prisma.program.create({
    data: {
      clientId,
      title,
      description,
      experienceLevel,
      durationOptions,
      createdBy: userId,
      weeks: {
        create: weeks.map((w: any) => ({
          name: w.name.trim(),
          weekIndex: w.weekIndex,
          days: {
            create: w.days.map((d: any) => ({
              name: d.name.trim(),
              dayIndex: d.dayIndex,
              isRestDay: d.isRestDay,
              templateId: d.isRestDay ? null : d.templateId,
            })),
          },
        })),
      },
    },
  })

  return res.json(new ApiResponse(200, { program }, 'Program created successfully'))
})

export const getAllPrograms = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const skip = (page - 1) * limit

  const [programs, total] = await Promise.all([
    prisma.program.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { userPrograms: true } } },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.program.count({ where: { deletedAt: null } }),
  ])

  const results = programs.map((p) => ({
    ...p,
    enrolledCount: p._count.userPrograms,
    enrolledCountLabel: formatCompactNumber(p._count.userPrograms),
  }))
  return res.json(
    new ApiResponse(
      200,
      { programs: results, pagination: { total, page, limit, pages: Math.ceil(total / limit) } },
      'Programs fetched',
    ),
  )
})

export const getProgramById = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    const program = await prisma.program.findUnique({
      where: { id: req.params.programId },
      include: {
        weeks: {
          orderBy: { weekIndex: 'asc' },
          include: {
            days: {
              orderBy: { dayIndex: 'asc' },
              include: {
                template: {
                  include: {
                    exerciseGroups: true,
                    exercises: { include: { sets: true, exercise: true } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!program) throw new ApiError(404, 'Program not found')
    return res.json(new ApiResponse(200, { program }, 'Program fetched'))
  },
)

export const editProgram = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    const { programId } = req.params
    const userId = req.user!.id
    const { title, description, experienceLevel, durationOptions, weeks } = req.body

    const program = await prisma.program.findUnique({
      where: { id: programId },
      select: { id: true, createdBy: true },
    })
    if (!program || program.createdBy !== userId) throw new ApiError(403, 'Unauthorized')

    const updated = await prisma.$transaction(async (tx) => {
      await tx.program.update({
        where: { id: programId },
        data: { title, description, experienceLevel, durationOptions },
      })
      if (weeks) {
        await tx.programWeek.deleteMany({ where: { programId } })
        for (const w of weeks) {
          await tx.programWeek.create({
            data: {
              programId,
              name: w.name.trim(),
              weekIndex: w.weekIndex,
              days: {
                create: w.days.map((d: any) => ({
                  name: d.name.trim(),
                  dayIndex: d.dayIndex,
                  isRestDay: d.isRestDay,
                  templateId: d.isRestDay ? null : d.templateId,
                })),
              },
            },
          })
        }
      }
      return tx.program.findUnique({
        where: { id: programId },
        include: { weeks: { include: { days: { include: { template: true } } } } },
      })
    })

    return res.json(new ApiResponse(200, { program: updated }, 'Program updated'))
  },
)

export const deleteProgram = asyncHandler(
  async (req: Request<{ programId: string }>, res: Response) => {
    const program = await prisma.program.findUnique({
      where: { id: req.params.programId },
      select: { createdBy: true },
    })
    if (program?.createdBy !== req.user!.id) throw new ApiError(403, 'Unauthorized')
    await prisma.program.update({
      where: { id: req.params.programId },
      data: { deletedAt: new Date() },
    })
    return res.json(new ApiResponse(200, null, 'Program deleted'))
  },
)

export const startProgram = asyncHandler(
  async (req: Request<{ userId: string; programId: string }>, res: Response) => {
    const { userId, programId } = req.params
    const { duration, startDate } = req.body
    if (userId !== req.user!.id) throw new ApiError(403, 'Unauthorized')

    const program = await prisma.program.findUnique({
      where: { id: programId },
      include: { weeks: { include: { days: { include: { template: true } } } } },
    })
    if (!program) throw new ApiError(404, 'Program not found')

    const result = await prisma.$transaction(async (tx) => {
      await tx.userProgram.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'paused' },
      })
      const userProgram = await tx.userProgram.create({
        data: {
          userId,
          programId,
          durationWeeks: duration,
          startDate: startDate ?? new Date(),
          status: 'active',
        },
      })
      await programService.instantiateUserWeek(tx, userProgram.id, program, 0)
      await tx.userProgramProgress.create({
        data: { userProgramId: userProgram.id, currentWeek: 0, currentDay: 0 },
      })
      return tx.userProgram.findUnique({
        where: { id: userProgram.id },
        include: {
          weeks: { include: { days: { include: { templateSnapshot: true } } } },
          program: { select: standardProgramSelect },
          progress: true,
        },
      })
    })

    return res.json(
      new ApiResponse(
        200,
        { userProgram: programService.formatUserProgram(result) },
        'Program started',
      ),
    )
  },
)

export const getUserProgramById = asyncHandler(
  async (req: Request<{ userId: string; userProgramId: string }>, res: Response) => {
    const { userId, userProgramId } = req.params
    const requestedWeek = parseInt(req.query.weekIndex as string) || 0
    if (userId !== req.user!.id) throw new ApiError(403, 'Unauthorized')

    let up = await prisma.userProgram.findUnique({
      where: { id: userProgramId },
      include: {
        weeks: {
          where: { weekIndex: requestedWeek },
          include: { days: { include: { templateSnapshot: true } } },
        },
        program: { select: standardProgramSelect },
        progress: true,
      },
    })
    if (!up || up.userId !== userId) throw new ApiError(404, 'Program not found')

    if (up.weeks.length === 0 && requestedWeek < up.durationWeeks) {
      const base = await prisma.program.findUnique({
        where: { id: up.programId },
        include: { weeks: { include: { days: { include: { template: true } } } } },
      })
      if (base) {
        await prisma.$transaction(
          async (tx) => {
            await programService.instantiateUserWeek(tx, userProgramId, base, requestedWeek)
          },
          { timeout: 10000 },
        )
        up = await prisma.userProgram.findUnique({
          where: { id: userProgramId },
          include: {
            weeks: {
              where: { weekIndex: requestedWeek },
              include: { days: { include: { templateSnapshot: true } } },
            },
            program: { select: standardProgramSelect },
            progress: true,
          },
        })
      }
    }

    up = await programService.syncAndPopulateUserProgram(up)
    return res.json(
      new ApiResponse(200, { program: programService.formatUserProgram(up) }, 'Program fetched'),
    )
  },
)

export const getActiveUserProgram = asyncHandler(
  async (req: Request<{ userId: string }>, res: Response) => {
    let up = await prisma.userProgram.findFirst({
      where: { userId: req.params.userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: { program: { select: standardProgramSelect }, progress: true },
    })
    if (!up) return res.json(new ApiResponse(200, { program: null }, 'No active program'))
    up = await programService.syncAndPopulateUserProgram(up)
    return res.json(
      new ApiResponse(
        200,
        { program: programService.formatUserProgram(up) },
        'Active program fetched',
      ),
    )
  },
)

export const listUserPrograms = asyncHandler(
  async (req: Request<{ userId: string }>, res: Response) => {
    const ups = await prisma.userProgram.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      include: { program: { select: standardProgramSelect }, progress: true },
    })
    return res.json(new ApiResponse(200, { programs: ups }, 'User programs fetched'))
  },
)
