import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as metaService from './service.js'
import type { MetaResource } from './types.js'

// FUNCTIONS

/**
 * Fetch all items for a meta resource.
 */
export const getAllMeta = asyncHandler(async (req: Request, res: Response) => {
  const resource = req.params.resource as MetaResource
  const data = await metaService.getAllMeta(resource)
  return res.status(200).json(new ApiResponse(200, data, 'Fetched successfully'))
})

/**
 * Fetch a single meta item by ID.
 */
export const getMetaById = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as { resource: MetaResource; id: string }
  const item = await metaService.getMetaById(resource, id)
  return res.status(200).json(new ApiResponse(200, item, 'Fetched successfully'))
})

/**
 * Create or update a meta item.
 */
export const upsertMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as { resource: MetaResource; id?: string }
  const result = await metaService.upsertMeta(resource, id, req.body, req.file, req.user?.id)
  return res.status(200).json(new ApiResponse(200, result, 'Saved successfully'))
})

/**
 * Delete a meta item.
 */
export const deleteMeta = asyncHandler(async (req: Request, res: Response) => {
  const { resource, id } = req.params as { resource: MetaResource; id: string }
  const deleted = await metaService.deleteMeta(resource, id, req.user!.id)
  return res.status(200).json(new ApiResponse(200, deleted, 'Deleted successfully'))
})
