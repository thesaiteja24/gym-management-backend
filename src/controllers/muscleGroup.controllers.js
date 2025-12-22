import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { randomUUID } from 'crypto'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { uploadMedia, deleteMediaByKey, extractS3KeyFromUrl } from '../services/media.service.js'
import { titleizeString } from '../utils/helpers.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createMuscleGroup = asyncHandler(async (req, res) => {
	const { title } = req.body
	const image = req.file

	if (!title) {
		logWarn('MuscleGroup title not provided', { action: 'createMuscleGroup' }, req)
		throw new ApiError(400, 'Title is required')
	}

	if (!image) {
		logWarn('MuscleGroup image not provided', { action: 'createMuscleGroup' }, req)
		throw new ApiError(400, 'Image file is required')
	}

	const filePath = `gym-sass/muscle-group/${randomUUID()}`
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
	} catch {
		logError('Failed to upload MuscleGroup image', { action: 'createMuscleGroup' }, req)
		throw new ApiError(500, 'Failed to upload MuscleGroup image')
	}

	try {
		const muscleGroup = await prisma.muscleGroup.create({
			data: {
				title: titleizeString(title),
				thumbnailUrl,
			},
		})

		logInfo('MuscleGroup created', { action: 'createMuscleGroup', muscleGroupId: muscleGroup.id }, req)

		return res.json(new ApiResponse(200, muscleGroup, 'MuscleGroup created successfully'))
	} catch (error) {
		// rollback uploaded image
		await deleteMediaByKey({
			key: mediaKey,
			userId: req.user.id,
			reason: 'muscleGroup create db failure',
		})

		if (error.code === 'P2002') {
			logWarn('MuscleGroup with this title already exists', { action: 'createMuscleGroup' }, req)
			throw new ApiError(400, 'MuscleGroup with this title already exists')
		}
		logError('Failed to create MuscleGroup in DB', { action: 'createMuscleGroup' }, req)
		throw new ApiError(500, 'Failed to create MuscleGroup')
	}
})

export const getAllMuscleGroups = asyncHandler(async (req, res) => {
	const muscleGroupList = await prisma.muscleGroup.findMany({
		orderBy: { title: 'asc' },
	})

	if (!muscleGroupList.length) {
		logWarn('No MuscleGroups found', { action: 'getAllMuscleGroups' }, req)
		throw new ApiError(404, 'No MuscleGroups found')
	}

	return res.json(new ApiResponse(200, muscleGroupList, 'MuscleGroup list fetched'))
})

export const updateMuscleGroup = asyncHandler(async (req, res) => {
	const { id } = req.params
	const { title } = req.body
	const image = req.file

	if (!id) {
		logWarn('MuscleGroup ID not provided', { action: 'updateMuscleGroup' }, req)
		throw new ApiError(400, 'MuscleGroup ID is required')
	}

	const existingMuscleGroup = await prisma.muscleGroup.findUnique({
		where: { id },
	})

	if (!existingMuscleGroup) {
		logWarn('MuscleGroup to update not found', { action: 'updateMuscleGroup', muscleGroupId: id }, req)
		throw new ApiError(404, 'No MuscleGroup exists with the provided ID')
	}

	let newThumbnailUrl = null
	let newMediaKey = null

	if (image) {
		const filePath = `gym-sass/muscle-group/${randomUUID()}`
		try {
			newThumbnailUrl = await uploadMedia({
				file: image,
				mediaType: 'equipment',
				filePath,
				userId: req.user.id,
			})
			newMediaKey = `${filePath}.webp`
		} catch {
			logError('Failed to upload new MuscleGroup image', { action: 'updateMuscleGroup', muscleGroupId: id }, req)
			throw new ApiError(500, 'Failed to upload MuscleGroup image')
		}
	}

	let updatedMuscleGroup
	try {
		updatedMuscleGroup = await prisma.muscleGroup.update({
			where: { id },
			data: {
				...(title && { title: titleizeString(title) }),
				...(newThumbnailUrl && { thumbnailUrl: newThumbnailUrl }),
			},
		})
	} catch {
		if (newMediaKey) {
			await deleteMediaByKey({
				key: newMediaKey,
				userId: req.user.id,
				reason: 'muscleGroup update db failure',
			})
		}
		logError('Failed to update MuscleGroup in DB', { action: 'updateMuscleGroup', muscleGroupId: id }, req)
		throw new ApiError(500, 'Failed to update MuscleGroup')
	}

	// delete old image after success
	if (image && existingMuscleGroup.thumbnailUrl) {
		const oldKey = extractS3KeyFromUrl(existingMuscleGroup.thumbnailUrl)
		if (oldKey) {
			await deleteMediaByKey({
				key: oldKey,
				userId: req.user.id,
				reason: 'muscleGroup image replaced',
			})
		}
	}

	logInfo('MuscleGroup updated', { action: 'updateMuscleGroup', muscleGroupId: id }, req)

	return res.json(new ApiResponse(200, updatedMuscleGroup, 'MuscleGroup updated successfully'))
})

export const deleteMuscleGroup = asyncHandler(async (req, res) => {
	const { id } = req.params

	if (!id) {
		logWarn('MuscleGroup ID not provided for deletion', { action: 'deleteMuscleGroup' }, req)
		throw new ApiError(400, 'MuscleGroup ID is required')
	}

	const existingMuscleGroup = await prisma.muscleGroup.findUnique({
		where: { id },
	})

	if (!existingMuscleGroup) {
		logWarn('MuscleGroup to delete not found', { action: 'deleteMuscleGroup', muscleGroupId: id }, req)
		throw new ApiError(404, 'No MuscleGroup exists with the provided ID')
	}

	const deletedMuscleGroup = await prisma.muscleGroup.delete({
		where: { id },
	})

	// cleanup media (best effort)
	if (existingMuscleGroup.thumbnailUrl) {
		const key = extractS3KeyFromUrl(existingMuscleGroup.thumbnailUrl)
		if (key) {
			await deleteMediaByKey({
				key,
				userId: req.user.id,
				reason: 'muscleGroup deleted',
			})
		}
	}

	logInfo('MuscleGroup deleted', { action: 'deleteMuscleGroup', muscleGroupId: id }, req)

	return res.json(new ApiResponse(200, deletedMuscleGroup, 'MuscleGroup deleted successfully'))
})
