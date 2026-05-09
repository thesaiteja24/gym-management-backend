import { prisma } from '../../lib/prisma.js'
import type { Request, Response } from 'express'

import { ApiError } from '../../utils/ApiError.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as templateService from './template.service.js'



const templateInclude = {
  exerciseGroups: { orderBy: { groupIndex: 'asc' as const } },
  exercises: {
    orderBy: { exerciseIndex: 'asc' as const },
    include: {
      sets: { orderBy: { setIndex: 'asc' as const } },
      exercise: { select: { id: true, title: true, thumbnailUrl: true, exerciseType: true } },
    },
  },
}

export const createTemplate = asyncHandler(
  async (req: Request<object, object, templateService.CreateTemplateData>, res: Response) => {
    const template = await templateService.processCreateTemplate(req.user!.id, req.body)
    return res.status(201).json(new ApiResponse(201, { template }, 'Template created successfully'))
  },
)

export const getAllTemplates = asyncHandler(async (req: Request, res: Response) => {
  const templates = await prisma.workoutTemplate.findMany({
    where: { userId: req.user!.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: templateInclude,
  })
  return res.json(new ApiResponse(200, templates, 'Templates fetched successfully'))
})

export const getTemplateById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const template = await prisma.workoutTemplate.findUnique({
    where: { id: req.params.id },
    include: templateInclude,
  })
  if (!template || template.userId !== req.user!.id) throw new ApiError(404, 'Template not found')
  return res.json(new ApiResponse(200, template, 'Template fetched successfully'))
})

export const getTemplateByShareId = asyncHandler(
  async (req: Request<{ id: string }>, res: Response) => {
    const template = await prisma.workoutTemplate.findUnique({
      where: { shareId: req.params.id },
      include: templateInclude,
    })
    if (!template) throw new ApiError(404, 'Shared Template not found')
    return res.json(new ApiResponse(200, template, 'Template fetched successfully'))
  },
)

export const updateTemplate = asyncHandler(
  async (
    req: Request<{ id: string }, object, templateService.CreateTemplateData>,
    res: Response,
  ) => {
    const updatedTemplate = await templateService.processUpdateTemplate(
      req.user!.id,
      req.params.id,
      req.body,
    )
    return res.json(new ApiResponse(200, updatedTemplate, 'Template updated successfully'))
  },
)

export const deleteTemplate = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const template = await prisma.workoutTemplate.findUnique({ where: { id: req.params.id } })
  if (!template || template.userId !== req.user!.id) throw new ApiError(404, 'Template not found')

  await prisma.workoutTemplate.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  })
  return res.json(new ApiResponse(200, null, 'Template deleted successfully'))
})
