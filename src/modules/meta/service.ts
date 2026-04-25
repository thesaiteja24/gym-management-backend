import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { deleteCache, getCache, setCache } from '../../service/caching.service.js'
import {
  deleteMediaByKey,
  extractS3KeyFromUrl,
  uploadMedia,
} from '../../service/media.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { titleizeString } from '../../utils/helpers.js'
import type { MetaItem, MetaResource, UpsertMetaBody } from './types.js'

// CONSTANTS

const prisma = new PrismaClient().$extends(withAccelerate())
const META_CACHE_TTL = '365d'

const RESOURCE_CONFIG: Record<MetaResource, any> = {
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

// QUERY HELPERS

/**
 * Generates a cache key for a meta resource.
 */
const getMetaCacheKey = (resource: MetaResource) => `meta:${resource}:all`

// FUNCTIONS

/**
 * Fetch all items for a meta resource.
 */
export async function getAllMeta(resource: MetaResource): Promise<MetaItem[]> {
  const cacheKey = getMetaCacheKey(resource)
  const cached = await getCache<MetaItem[]>(cacheKey)
  if (cached) return cached

  const data = await RESOURCE_CONFIG[resource].model.findMany({
    orderBy: { title: 'asc' },
  })

  await setCache(cacheKey, data, META_CACHE_TTL)
  return data
}

/**
 * Fetch a single meta item by ID.
 */
export async function getMetaById(resource: MetaResource, id: string): Promise<MetaItem> {
  const item = await RESOURCE_CONFIG[resource].model.findUnique({ where: { id } })
  if (!item) throw new ApiError(404, `${RESOURCE_CONFIG[resource].label} not found`)
  return item
}

/**
 * Create or update a meta item.
 */
export async function upsertMeta(
  resource: MetaResource,
  id: string | undefined,
  body: UpsertMetaBody,
  file?: any,
  userId?: string,
): Promise<MetaItem> {
  const config = RESOURCE_CONFIG[resource]
  const existing = id ? await config.model.findUnique({ where: { id } }) : null

  if (id && !existing) throw new ApiError(404, `${config.label} not found`)
  if (!id && !file) throw new ApiError(400, 'Image required for new entries')

  let uploaded: { url: string; key: string } | null = null
  if (file && userId) {
    const filePath = `${config.s3Path}/${randomUUID()}`
    const url = await uploadMedia({
      file,
      mediaType: 'equipment',
      filePath,
      userId,
    })
    uploaded = { url, key: `${filePath}.webp` }
  }

  try {
    const data: any = {
      ...(body.title && { title: titleizeString(body.title) }),
      ...(uploaded && { thumbnailUrl: uploaded.url }),
      ...(resource === 'equipment' && body.type !== undefined && { type: body.type }),
    }

    const result = id
      ? await config.model.update({ where: { id }, data })
      : await config.model.create({
          data: { ...data, title: titleizeString(body.title!) },
        })

    // Cleanup old image if updated
    if (uploaded && existing?.thumbnailUrl && userId) {
      const oldKey = extractS3KeyFromUrl(existing.thumbnailUrl)
      if (oldKey) {
        await deleteMediaByKey({
          key: oldKey,
          userId,
          reason: 'replaced',
        })
      }
    }

    await deleteCache(getMetaCacheKey(resource))
    return result
  } catch (error) {
    if (uploaded && userId) {
      await deleteMediaByKey({
        key: uploaded.key,
        userId,
        reason: 'DB failure',
      })
    }
    throw error
  }
}

/**
 * Delete a meta item.
 */
export async function deleteMeta(resource: MetaResource, id: string, userId: string): Promise<MetaItem> {
  const config = RESOURCE_CONFIG[resource]
  const existing = await config.model.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, `${config.label} not found`)

  const deleted = await config.model.delete({ where: { id } })

  if (existing.thumbnailUrl) {
    const key = extractS3KeyFromUrl(existing.thumbnailUrl)
    if (key) {
      await deleteMediaByKey({
        key,
        userId,
        reason: 'deleted',
      })
    }
  }

  await deleteCache(getMetaCacheKey(resource))
  return deleted
}
