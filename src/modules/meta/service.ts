import { randomUUID } from 'crypto'

import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { deleteCache, getCache, setCache } from '../../service/caching.service.js'
import { deleteMediaByKey, extractS3KeyFromUrl, uploadMedia } from '../../service/media.service.js'
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
 * Prepares the data object for Prisma update/create.
 */
function prepareMetaData(resource: MetaResource, body: UpsertMetaBody, uploadedUrl?: string) {
  return {
    ...(body.title && { title: titleizeString(body.title) }),
    ...(uploadedUrl && { thumbnailUrl: uploadedUrl }),
    ...(resource === 'equipment' && body.type !== undefined && { type: body.type }),
  }
}

/**
 * Handles S3 image upload and optional cleanup of old images.
 */
async function handleMetaImageUpload(
  config: any,
  file: any,
  userId: string,
  existingImageUrl?: string | null,
) {
  const filePath = `${config.s3Path}/${randomUUID()}`
  const url = await uploadMedia({
    file,
    mediaType: 'equipment',
    filePath,
    userId,
  })

  // Cleanup old image if it exists
  if (existingImageUrl) {
    const oldKey = extractS3KeyFromUrl(existingImageUrl)
    if (oldKey) {
      await deleteMediaByKey({ key: oldKey, userId, reason: 'replaced' })
    }
  }

  return { url, key: `${filePath}.webp` }
}

interface UpsertMetaOptions {
  resource: MetaResource
  id?: string
  body: UpsertMetaBody
  file?: any
  userId?: string
}

async function validateUpsert(config: any, id?: string) {
  const existing = id ? await config.model.findUnique({ where: { id } }) : null
  if (id && !existing) throw new ApiError(404, `${config.label} not found`)
  return existing
}

async function persistMeta(config: any, id: string | undefined, data: any, body: UpsertMetaBody) {
  return id
    ? config.model.update({ where: { id }, data })
    : config.model.create({
        data: { ...data, title: titleizeString(body.title!) },
      })
}

/**
 * Create or update a meta item.
 */
export async function upsertMeta(options: UpsertMetaOptions): Promise<MetaItem> {
  const { resource, id, body, file, userId } = options
  const config = RESOURCE_CONFIG[resource]

  const existing = await validateUpsert(config, id)
  if (!id && !file) throw new ApiError(400, 'Image required for new entries')

  let uploaded: { url: string; key: string } | null = null

  try {
    if (file && userId) {
      uploaded = await handleMetaImageUpload(config, file, userId, existing?.thumbnailUrl)
    }

    const data = prepareMetaData(resource, body, uploaded?.url)
    const result = await persistMeta(config, id, data, body)

    await deleteCache(getMetaCacheKey(resource))
    return result
  } catch (error) {
    if (uploaded && userId) {
      await deleteMediaByKey({ key: uploaded.key, userId, reason: 'DB failure' })
    }
    throw error
  }
}

/**
 * Delete a meta item.
 */
export async function deleteMeta(
  resource: MetaResource,
  id: string,
  userId: string,
): Promise<MetaItem> {
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
