import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { deleteMediaByKey, uploadExerciseVideo } from '../services/media.service.js'
import { titleizeString } from '../utils/helpers.js'
import { ApiError } from '../utils/ApiError.js'
import { randomUUID } from 'crypto'
import { ApiResponse } from '../utils/ApiResponse.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createExercise = asyncHandler(async (req, res) => {
	const { title, instructions, primaryMuscleGroupId, equipmentId, exerciseType } = req.body
	const video = req.file

	const requiredFields = {
		title,
		instructions,
		primaryMuscleGroupId,
		equipmentId,
		exerciseType,
	}

	const missingFields = Object.entries(requiredFields)
		.filter(([_, value]) => !value)
		.map(([key]) => key)

	if (missingFields.length > 0) {
		logWarn('Missing required fields to create Exercise', { action: 'createExercise', missingFields }, req)

		throw new ApiError(400, `Missing required fields: ${missingFields.join(', ')}`)
	}

	if (!video) {
		logWarn('Video is required', { action: 'createExercise' }, req)
		throw new ApiError(400, 'Exercise video is required')
	}

	const basePath = `gym-sass/exercises/${randomUUID()}`
	let uploaded

	try {
		uploaded = await uploadExerciseVideo({ file: video, filePath: basePath, userId: req.user.id })
	} catch (error) {
		logError('Failed to upload exercise media', error, { action: 'createExercise', error: error.message }, req)
		throw new ApiError(500, 'Failed to upload exercise media', error.message)
	}

	try {
		const exercise = await prisma.exercise.create({
			data: {
				title: titleizeString(title),
				instructions,
				primaryMuscleGroupId,
				equipmentId,
				exerciseType,
				videoUrl: uploaded.videoUrl,
				thumbnailUrl: uploaded.thumbnailUrl,
			},
		})

		logInfo('Exercise created successfully', { action: 'createExercise', exerciseId: exercise.id }, req)

		return res.json(new ApiResponse(200, exercise, 'Exercise created successfully'))
	} catch (error) {
		await deleteMediaByKey({
			key: uploaded.videoKey,
			userId: req.user.id,
			reason: 'exercise create db failure',
		})

		await deleteMediaByKey({
			key: uploaded.thumbnailKey,
			userId: req.user.id,
			reason: 'exercise create db failure',
		})

		logError('Failed to create Exercise', error, { action: 'createExercise', error: error.message }, req)
		throw new ApiError(500, 'Failed to create exercise', error.message)
	}
})
