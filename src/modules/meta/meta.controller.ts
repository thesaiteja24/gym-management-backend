import { randomUUID } from 'crypto'

import type { EquipmentType } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { getCache, setCache, deleteCache } from '../../common/services/caching.service.js'
import type { UploadedFile } from '../../common/services/media.service.js'
import {
  uploadMedia,
  deleteMediaByKey,
  extractS3KeyFromUrl,
} from '../../common/services/media.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { titleizeString } from '../../common/utils/helpers.js'
import { logError, logInfo, logWarn } from '../../common/utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

type MetaResource = 'equipment' | 'muscle-groups'

const META_CACHE_TTL = '365d'
const getMetaCacheKey = (resource: MetaResource) => `meta:${resource}:all`

const RESOURCE_CONFIG: Record<
  MetaResource,
  {
    model: any
    s3Path: string
    label: string
  }
> = {
  equipment: {
    model: prisma.equipment,
    s3Path: 'gym-sass/equipment',
    label: 'Equipment',
  },
  'muscle-groups': {
    model: prisma.muscleGroup,
    s3Path: 'gym-sass/muscle-group',
    label: 'Muscle Group',
  },
}

export const getAllMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource } = req.params as { resource: MetaResource }
  const config = RESOURCE_CONFIG[resource]
  const cacheKey = getMetaCacheKey(resource)

  const cachedData = await getCache<any[]>(cacheKey)
  if (cachedData) {
    logInfo(
      `${config.label} list fetched from cache`,
      { action: 'getAllMeta', resource, count: cachedData.length },
      req,
    )
    return res.json(new ApiResponse(200, cachedData, `${config.label} list fetched successfully`))
  }

  const data = await config.model.findMany({
    orderBy: { title: 'asc' },
  })

  await setCache(cacheKey, data, META_CACHE_TTL)

  logInfo(
    `${config.label} list fetched`,
    { action: 'getAllMeta', resource, count: data.length },
    req,
  )
  return res.json(new ApiResponse(200, data, `${config.label} list fetched successfully`))
})

export const getMetaById = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as { resource: MetaResource; id: string }
  const config = RESOURCE_CONFIG[resource]

  const item = await config.model.findUnique({ where: { id } })

  if (!item) {
    logWarn(`${config.label} not found`, { action: 'getMetaById', resource, id }, req)
    throw new ApiError(404, `${config.label} not found`)
  }

  return res.json(new ApiResponse(200, item, `${config.label} fetched successfully`))
})

export const upsertMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as { resource: MetaResource; id?: string }
  const { title, type } = req.body as { title?: string; type?: EquipmentType }
  const image = req.file as UploadedFile | undefined
  const config = RESOURCE_CONFIG[resource]

  let existingItem = null
  if (id) {
    existingItem = await config.model.findUnique({ where: { id } })
    if (!existingItem) throw new ApiError(404, `${config.label} not found`)
  } else if (!image) {
    throw new ApiError(400, 'Image file is required for new entries')
  }

  let thumbnailUrl: string | undefined
  let mediaKey: string | undefined

  if (image) {
    const filePath = `${config.s3Path}/${randomUUID()}`
    try {
      thumbnailUrl = await uploadMedia({
        file: image,
        mediaType: 'equipment', // Using 'equipment' as generic media type for these lookups
        filePath,
        userId: req.user!.id,
      })
      mediaKey = `${filePath}.webp`
    } catch (error) {
      logError(
        `Failed to upload ${config.label} image`,
        error as Error,
        { action: 'upsertMeta', resource },
        req,
      )
      throw new ApiError(500, `Failed to upload ${config.label} image`)
    }
  }

  try {
    let result
    const data = {
      ...(title && { title: titleizeString(title) }),
      ...(thumbnailUrl && { thumbnailUrl }),
      ...(resource === 'equipment' && type !== undefined && { type }),
    }

    if (id) {
      result = await config.model.update({ where: { id }, data })
    } else {
      result = await config.model.create({
        data: {
          ...data,
          title: titleizeString(title!),
        },
      })
    }

    // Cleanup old image if replaced
    if (image && existingItem?.thumbnailUrl) {
      const oldKey = extractS3KeyFromUrl(existingItem.thumbnailUrl)
      if (oldKey) {
        await deleteMediaByKey({
          key: oldKey,
          userId: req.user!.id,
          reason: `${resource} image replaced`,
        })
      }
    }

    // Invalidate cache
    await deleteCache(getMetaCacheKey(resource))

    logInfo(
      `${config.label} ${id ? 'updated' : 'created'}`,
      { action: 'upsertMeta', resource, id: result.id },
      req,
    )
    return res.json(new ApiResponse(200, result, `${config.label} saved successfully`))
  } catch (error) {
    if (mediaKey) {
      await deleteMediaByKey({ key: mediaKey, userId: req.user!.id, reason: 'db failure' })
    }
    const err = error as Error & { code?: string }
    if (err.code === 'P2002')
      throw new ApiError(400, `${config.label} with this title already exists`)

    logError(`Failed to save ${config.label}`, err, { action: 'upsertMeta', resource }, req)
    throw new ApiError(500, `Failed to save ${config.label}`)
  }
})

export const deleteMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as { resource: MetaResource; id: string }
  const config = RESOURCE_CONFIG[resource]

  const existingItem = await config.model.findUnique({ where: { id } })
  if (!existingItem) throw new ApiError(404, `${config.label} not found`)

  try {
    const deletedItem = await config.model.delete({ where: { id } })

    if (existingItem.thumbnailUrl) {
      const key = extractS3KeyFromUrl(existingItem.thumbnailUrl)
      if (key) await deleteMediaByKey({ key, userId: req.user!.id, reason: `${resource} deleted` })
    }

    // Invalidate cache
    await deleteCache(getMetaCacheKey(resource))

    logInfo(`${config.label} deleted`, { action: 'deleteMeta', resource, id }, req)
    return res.json(new ApiResponse(200, deletedItem, `${config.label} deleted successfully`))
  } catch (error) {
    logError(
      `Failed to delete ${config.label}`,
      error as Error,
      { action: 'deleteMeta', resource, id },
      req,
    )
    throw new ApiError(500, `Failed to delete ${config.label}`)
  }
})
