import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { deleteMediaByKey, extractS3KeyFromUrl, uploadMedia } from '../services/media.service.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { titleizeString } from '../utils/helpers.js'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createEquipment = asyncHandler(async (req, res) => {
	const { title } = req.body
	const image = req.file

	if (!title) {
		logWarn('Title is required to create Equipment', { action: 'createEquipment' }, req)
		throw new ApiError(400, 'Title is required')
	}

	if (!image) {
		logWarn('Image file is required to create Equipment', { action: 'createEquipment' }, req)
		throw new ApiError(400, 'Image file is required')
	}

	const filePath = `gym-sass/equipment/${randomUUID()}`
	let thumbnailUrl
	let mediaKey

	try {
		thumbnailUrl = await uploadMedia({
			file: image,
			mediaType: 'equipment',
			filePath,
			userId: req.user.id,
		})
		mediaKey = `${filePath}.webp`
	} catch (error) {
		logError('Failed to upload Equipment Image', { action: 'createEquipment', error: error.message }, req)
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
		// Rollback uploaded media
		await deleteMediaByKey({
			key: mediaKey,
			userId: req.user.id,
			reason: 'equipment create db failure',
		})

		if (error.code === 'P2002') {
			logWarn(
				'Equipment with this title already exists',
				{ action: 'createEquipment', error: error.message },
				req
			)
			throw new ApiError(400, 'Equipment with this title already exists', error.message)
		}
		logError('Failed to create Equipment in DB', { action: 'createEquipment', error: error.message }, req)
		throw new ApiError(500, 'Failed to create Equipment', error.message)
	}
})

export const getAllEquipment = asyncHandler(async (req, res) => {
	const equipmentList = await prisma.equipment.findMany({
		orderBy: { title: 'asc' },
	})

	if (equipmentList.length === 0) {
		logWarn('No Equipment found', { action: 'getAllEquipment' }, req)
		throw new ApiError(404, 'No Equipment found')
	}

	return res.json(new ApiResponse(200, equipmentList, 'Equipment list fetched successfully'))
})

export const getEquipmentById = asyncHandler(async (req, res) => {
	const { id } = req.params

	if (!id) {
		logWarn('Equipment ID is required to fetch Equipment', { action: 'getEquipmentById' }, req)
		throw new ApiError(400, 'Equipment ID is required')
	}

	const equipment = await prisma.equipment.findUnique({ where: { id } })

	if (!equipment) {
		logWarn('Equipment not found', { action: 'getEquipmentById', equipmentId: id }, req)
		throw new ApiError(404, 'No equipment exists with the provided ID')
	}

	return res.json(new ApiResponse(200, equipment, 'Equipment fetched successfully'))
})

export const updateEquipment = asyncHandler(async (req, res) => {
	const { id } = req.params
	const { title } = req.body
	const image = req.file

	if (!id) {
		logWarn('Equipment ID is required to update Equipment', { action: 'updateEquipment' }, req)
		throw new ApiError(400, 'Equipment ID is required')
	}

	const existingEquipment = await prisma.equipment.findUnique({ where: { id } })

	if (!existingEquipment) {
		logWarn('Equipment not found for update', { action: 'updateEquipment', equipmentId: id }, req)
		throw new ApiError(404, 'No equipment exists with the provided ID')
	}

	let newThumbnailUrl = null
	let newMediaKey = null

	if (image) {
		const filePath = `gym-sass/equipment/${randomUUID()}`
		try {
			newThumbnailUrl = await uploadMedia({
				file: image,
				mediaType: 'equipment',
				filePath,
				userId: req.user.id,
			})
			newMediaKey = `${filePath}.webp`
		} catch (error) {
			logError(
				'Failed to upload new equipment image',
				{ action: 'updateEquipment', equipmentId: id, error: error.message },
				req
			)
			logError('Failed to upload Equipment Image', { action: 'updateEquipment', error: error.message }, req)
			throw new ApiError(500, 'Failed to upload equipment image')
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
		if (newMediaKey) {
			await deleteMediaByKey({
				key: newMediaKey,
				userId: req.user.id,
				reason: 'equipment update db failure',
			})
		}
		logError(
			'Failed to update Equipment in DB',
			{ action: 'updateEquipment', equipmentId: id, error: error.message },
			req
		)
		logError('Failed to update Equipment', { action: 'updateEquipment', error: error.message }, req)
		throw new ApiError(500, 'Failed to update Equipment')
	}

	// Delete old image AFTER successful update
	if (image && existingEquipment.thumbnailUrl) {
		const oldKey = extractS3KeyFromUrl(existingEquipment.thumbnailUrl)
		if (oldKey) {
			await deleteMediaByKey({
				key: oldKey,
				userId: req.user.id,
				reason: 'equipment image replaced',
			})
		}
	}

	logInfo('Equipment updated', { action: 'updateEquipment', equipmentId: id }, req)
	return res.json(new ApiResponse(200, updatedEquipment, 'Equipment updated successfully'))
})

export const deleteEquipment = asyncHandler(async (req, res) => {
	const { id } = req.params

	if (!id) {
		logWarn('Equipment ID is required to delete Equipment', { action: 'deleteEquipment' }, req)
		throw new ApiError(400, 'Equipment ID is required')
	}

	const existingEquipment = await prisma.equipment.findUnique({ where: { id } })

	if (!existingEquipment) {
		logWarn('Equipment not found for deletion', { action: 'deleteEquipment', equipmentId: id }, req)
		throw new ApiError(404, 'No equipment exists with the provided ID')
	}

	const deletedEquipment = await prisma.equipment.delete({ where: { id } })

	// Cleanup media (best effort)
	if (existingEquipment.thumbnailUrl) {
		const key = extractS3KeyFromUrl(existingEquipment.thumbnailUrl)
		if (key) {
			await deleteMediaByKey({
				key,
				userId: req.user.id,
				reason: 'equipment deleted',
			})
		}
	}

	logInfo('Equipment deleted', { action: 'deleteEquipment', equipmentId: id }, req)
	return res.json(new ApiResponse(200, deletedEquipment, 'Equipment deleted successfully'))
})
