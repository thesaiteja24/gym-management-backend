import { randomUUID } from 'crypto'

import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { getCache, setCache, deleteCache } from '../../common/services/caching.service.js'
import {
  uploadMedia,
  deleteMediaByKey,
  extractS3KeyFromUrl,
} from '../../common/services/media.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { titleizeString } from '../../common/utils/helpers.js'

const prisma = new PrismaClient().$extends(withAccelerate())
type MetaResource = 'equipment' | 'muscle-groups'
const META_CACHE_TTL = '365d'
const getMetaCacheKey = (resource: MetaResource) => `meta:${resource}:all`

const RESOURCE_CONFIG: any = {
  equipment: { model: prisma.equipment, s3Path: 'gym-sass/equipment', label: 'Equipment' },
  'muscle-groups': {
    model: prisma.muscleGroup,
    s3Path: 'gym-sass/muscle-group',
    label: 'Muscle Group',
  },
}

async function handleImageUpload(file: any, s3Path: string, userId: string) {
  const filePath = `${s3Path}/${randomUUID()}`
  const url = await uploadMedia({ file, mediaType: 'equipment', filePath, userId })
  return { url, key: `${filePath}.webp` }
}

export const getAllMeta = asyncHandler(async (req: Request, res: Response) => {
  const resource = req.params.resource as MetaResource
  const cacheKey = getMetaCacheKey(resource)
  const cached = await getCache<any[]>(cacheKey)
  if (cached) return res.json(new ApiResponse(200, cached, 'Fetched from cache'))

  const data = await RESOURCE_CONFIG[resource].model.findMany({ orderBy: { title: 'asc' } })
  await setCache(cacheKey, data, META_CACHE_TTL)
  return res.json(new ApiResponse(200, data, 'Fetched successfully'))
})

export const getMetaById = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as any
  const item = await RESOURCE_CONFIG[resource].model.findUnique({ where: { id } })
  if (!item) throw new ApiError(404, 'Not found')
  return res.json(new ApiResponse(200, item, 'Fetched successfully'))
})

export const upsertMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as any
  const { title, type } = req.body
  const config = RESOURCE_CONFIG[resource]
  const image = req.file

  const existing = id ? await config.model.findUnique({ where: { id } }) : null
  if (id && !existing) throw new ApiError(404, 'Not found')
  if (!id && !image) throw new ApiError(400, 'Image required for new entries')

  const uploaded = image ? await handleImageUpload(image, config.s3Path, req.user!.id) : null

  try {
    const data = {
      ...(title && { title: titleizeString(title) }),
      ...(uploaded && { thumbnailUrl: uploaded.url }),
      ...(resource === 'equipment' && type !== undefined && { type }),
    }
    const result = id
      ? await config.model.update({ where: { id }, data })
      : await config.model.create({ data: { ...data, title: titleizeString(title!) } })

    if (uploaded && existing?.thumbnailUrl) {
      const oldKey = extractS3KeyFromUrl(existing.thumbnailUrl)
      if (oldKey) await deleteMediaByKey({ key: oldKey, userId: req.user!.id, reason: 'replaced' })
    }
    await deleteCache(getMetaCacheKey(resource))
    return res.json(new ApiResponse(200, result, 'Saved successfully'))
  } catch (error) {
    if (uploaded)
      await deleteMediaByKey({ key: uploaded.key, userId: req.user!.id, reason: 'DB failure' })
    throw error
  }
})

export const deleteMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as any
  const config = RESOURCE_CONFIG[resource]
  const existing = await config.model.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Not found')

  const deleted = await config.model.delete({ where: { id } })
  if (existing.thumbnailUrl) {
    const key = extractS3KeyFromUrl(existing.thumbnailUrl)
    if (key) await deleteMediaByKey({ key, userId: req.user!.id, reason: 'deleted' })
  }
  await deleteCache(getMetaCacheKey(resource))
  return res.json(new ApiResponse(200, deleted, 'Deleted successfully'))
})
