import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { randomUUID } from 'crypto'
import { logInfo, logWarn } from '../utils/logger.js'
import { uploadMedia } from '../services/media.service.js'
import { titleizeString } from '../utils/helpers.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createMuscleGroup = asyncHandler(async (req, res) => {
	const { title } = req.body
	const image = req.file
	const filePath = `gym-sass/muscle-group/${randomUUID()}`

	if (!title) {
		logWarn('Title is required to create MuscleGroup', { action: 'createMuscleGroup' }, req)
		throw new ApiError(400, 'Title is required')
	}

	if (!image) {
		logWarn('Image file is required to create MuscleGroup', { action: 'createMuscleGroup' }, req)
		throw new ApiError(400, 'Image file is required')
	}

	let thumbnailUrl = ''
	try {
		thumbnailUrl = await uploadMedia({ file: image, mediaType: 'equipment', filePath, userId: req.user.id })
	} catch (error) {
		logWarn('Failed to upload MuscleGroup Image', { action: 'createMuscleGroup', error: error.message }, req)
		throw new ApiError(500, 'Failed to upload MuscleGroup Image', error.message)
	}

	try {
		const newMuscleGroup = await prisma.muscleGroup.create({
			data: { title: titleizeString(title), thumbnailUrl },
		})
		logInfo(
			'MuscleGroup created successfully',
			{ action: 'createMuscleGroup', muscleGroupId: newMuscleGroup.id },
			req
		)
		return res.json(new ApiResponse(200, newMuscleGroup, 'MuscleGroup created successfully'))
	} catch (error) {
		if (error.code === 'P2002') {
			logWarn(
				'MuscleGroup with this title already exists',
				{ action: 'createMuscleGroup', error: error.message },
				req
			)
			throw new ApiError(400, 'MuscleGroup with this title already exists', error.message)
		}
		throw new ApiError(500, 'Failed to create MuscleGroup', error.message)
	}
})

export const getAllMuscleGroups = asyncHandler(async (req, res) => {
	const muscleGroupList = await prisma.muscleGroup.findMany({
		orderBy: { title: 'asc' },
	})

	if (muscleGroupList.length === 0) {
		logWarn('No MuscleGroups found', { action: 'getAllMuscleGroup' }, req)
		throw new ApiError(404, 'No MuscleGroups found')
	}

	return res.json(new ApiResponse(200, muscleGroupList, 'MuscleGroupList'))
})
