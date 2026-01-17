import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { deleteMediaByKey, extractS3KeyFromUrl, uploadMedia, UploadedFile } from '../services/media.service.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { titleizeString } from '../utils/helpers.js'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient().$extends(withAccelerate())

interface CreateEquipmentBody {
	title: string
}

export const createEquipment = asyncHandler(
	async (req: Request<object, object, CreateEquipmentBody>, res: Response) => {
		const { title } = req.body
		const image = req.file as UploadedFile | undefined

		if (!image) {
			logWarn('Image file is required to create Equipment', { action: 'createEquipment' }, req)
			throw new ApiError(400, 'Image file is required')
		}

		const filePath = `gym-sass/equipment/${randomUUID()}`
		let thumbnailUrl: string
		let mediaKey: string

		try {
			thumbnailUrl = await uploadMedia({
				file: image,
				mediaType: 'equipment',
				filePath,
				userId: req.user!.id,
			})
			mediaKey = `${filePath}.webp`
		} catch (error) {
			const err = error as Error
			logError('Failed to upload Equipment Image', err, { action: 'createEquipment', error: err.message }, req)
			throw new ApiError(500, 'Failed to upload Equipment Image')
		}

		try {
			const equipment = await prisma.equipment.create({
				data: {
					title: titleizeString(title),
					thumbnailUrl,
				},
			})

			logInfo('Equipment created', { action: 'createEquipment', equipmentId: equipment.id }, req)
			return res.json(new ApiResponse(200, equipment, 'Equipment created successfully'))
		} catch (error) {
			const err = error as Error & { code?: string }
			// Rollback uploaded media
			await deleteMediaByKey({
				key: mediaKey,
				userId: req.user!.id,
				reason: 'equipment create db failure',
			})

			if (err.code === 'P2002') {
				logWarn(
					'Equipment with this title already exists',
					{ action: 'createEquipment', error: err.message },
					req
				)
				throw new ApiError(400, 'Equipment with this title already exists')
			}
			logError('Failed to create Equipment in DB', err, { action: 'createEquipment', error: err.message }, req)
			throw new ApiError(500, 'Failed to create Equipment')
		}
	}
)

export const getAllEquipment = asyncHandler(async (req: Request, res: Response) => {
	const equipmentList = await prisma.equipment.findMany({
		orderBy: { title: 'asc' },
	})

	if (equipmentList.length === 0) {
		logWarn('No Equipment found', { action: 'getAllEquipment' }, req)
		throw new ApiError(404, 'No Equipment found')
	}

	logInfo('Equipment list fetched', { action: 'getAllEquipment', count: equipmentList.length }, req)
	return res.json(new ApiResponse(200, equipmentList, 'Equipment list fetched successfully'))
})

export const getEquipmentById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const { id } = req.params

	// ID check handled by schema if we apply it to GetById too, but params usually validated.
	// Wait, getById doesn't accept body, so we likely validate params with a schema.
	// I already made updateEquipmentSchema which has params.id. I should probably make a generic id schema or just rely on the route param.
	// For now, I'll assume we validate params in routes.

	const equipment = await prisma.equipment.findUnique({ where: { id } })

	if (!equipment) {
		logWarn('Equipment not found', { action: 'getEquipmentById', equipmentId: id }, req)
		throw new ApiError(404, 'No equipment exists with the provided ID')
	}

	logInfo('Equipment fetched', { action: 'getEquipmentById', equipmentId: id }, req)
	return res.json(new ApiResponse(200, equipment, 'Equipment fetched successfully'))
})

interface UpdateEquipmentBody {
	title?: string
}

export const updateEquipment = asyncHandler(
	async (req: Request<{ id: string }, object, UpdateEquipmentBody>, res: Response) => {
		const { id } = req.params
		const { title } = req.body
		const image = req.file as UploadedFile | undefined

		const existingEquipment = await prisma.equipment.findUnique({ where: { id } })

		if (!existingEquipment) {
			logWarn('Equipment not found for update', { action: 'updateEquipment', equipmentId: id }, req)
			throw new ApiError(404, 'No equipment exists with the provided ID')
		}

		let newThumbnailUrl: string | null = null
		let newMediaKey: string | null = null

		if (image) {
			const filePath = `gym-sass/equipment/${randomUUID()}`
			try {
				newThumbnailUrl = await uploadMedia({
					file: image,
					mediaType: 'equipment',
					filePath,
					userId: req.user!.id,
				})
				newMediaKey = `${filePath}.webp`
			} catch (error) {
				const err = error as Error
				logError(
					'Failed to upload new Equipment image',
					err,
					{ action: 'updateEquipment', equipmentId: id, error: err.message },
					req
				)
				throw new ApiError(500, 'Failed to upload Equipment image')
			}
		}

		let updatedEquipment
		try {
			updatedEquipment = await prisma.equipment.update({
				where: { id },
				data: {
					...(title && { title: titleizeString(title) }),
					...(newThumbnailUrl && { thumbnailUrl: newThumbnailUrl }),
				},
			})
		} catch (error) {
			const err = error as Error
			if (newMediaKey) {
				await deleteMediaByKey({
					key: newMediaKey,
					userId: req.user!.id,
					reason: 'equipment update db failure',
				})
			}
			logError(
				'Failed to update Equipment in DB',
				err,
				{ action: 'updateEquipment', equipmentId: id, error: err.message },
				req
			)
			throw new ApiError(500, 'Failed to update Equipment')
		}

		// Delete old image AFTER successful update
		if (image && existingEquipment.thumbnailUrl) {
			const oldKey = extractS3KeyFromUrl(existingEquipment.thumbnailUrl)
			if (oldKey) {
				await deleteMediaByKey({
					key: oldKey,
					userId: req.user!.id,
					reason: 'equipment image replaced',
				})
			}
		}

		logInfo('Equipment updated', { action: 'updateEquipment', equipmentId: id }, req)
		return res.json(new ApiResponse(200, updatedEquipment, 'Equipment updated successfully'))
	}
)

export const deleteEquipment = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const { id } = req.params

	const existingEquipment = await prisma.equipment.findUnique({ where: { id } })

	if (!existingEquipment) {
		logWarn('Equipment not found for deletion', { action: 'deleteEquipment', equipmentId: id }, req)
		throw new ApiError(404, 'No equipment exists with the provided ID')
	}

	try {
		const deletedEquipment = await prisma.equipment.delete({ where: { id } })

		const thumbnailKey = extractS3KeyFromUrl(existingEquipment.thumbnailUrl)

		// Cleanup media (best effort)
		if (thumbnailKey) {
			await deleteMediaByKey({
				key: thumbnailKey,
				userId: req.user!.id,
				reason: 'equipment deleted',
			})
		}

		logInfo('Equipment deleted', { action: 'deleteEquipment', equipmentId: id }, req)
		return res.json(new ApiResponse(200, deletedEquipment, 'Equipment deleted successfully'))
	} catch (error) {
		const err = error as Error
		logError(
			'Failed to delete Equipment',
			err,
			{ action: 'deleteEquipment', equipmentId: id, error: err.message },
			req
		)
		throw new ApiError(500, 'Failed to delete Equipment')
	}
})
