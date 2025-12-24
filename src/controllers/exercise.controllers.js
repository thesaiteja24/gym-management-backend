import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { deleteMediaByKey, extractS3KeyFromUrl, uploadExerciseVideo } from '../services/media.service.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { titleizeString } from '../utils/helpers.js'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createExercise = asyncHandler(async (req, res) => {
	const { title, instructions, primaryMuscleGroupId, equipmentId, exerciseType } = req.body
	const video = req.file

	if (!title) {
		logWarn('Title is required to create Exercise', { action: 'createExercise' }, req)
		throw new ApiError(400, 'Title is required')
	}

	if (!exerciseType) {
		logWarn('Exercise type is required', { action: 'createExercise' }, req)
		throw new ApiError(400, 'Exercise type is required')
	}

	if (!video) {
		logWarn('Video is required to create Exercise', { action: 'createExercise' }, req)
		throw new ApiError(400, 'Exercise video is required')
	}

	const filePath = `gym-sass/exercises/${randomUUID()}`
	let uploaded

	try {
		uploaded = await uploadExerciseVideo({
			file: video,
			filePath,
			userId: req.user.id,
		})
	} catch (error) {
		logError('Failed to upload Exercise media', error, { action: 'createExercise', error: error.message }, req)
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

		logInfo('Exercise created', { action: 'createExercise', exerciseId: exercise.id }, req)
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

		logError('Failed to create Exercise in DB', error, { action: 'createExercise', error: error.message }, req)
		throw new ApiError(500, 'Failed to create exercise', error.message)
	}
})

export const getAllExercises = asyncHandler(async (req, res) => {
	const exerciseList = await prisma.exercise.findMany({
		orderBy: { title: 'asc' },
		include: {
			primaryMuscleGroup: true,
			equipment: true,
			otherMuscleGroups: true,
		},
	})

	if (exerciseList.length === 0) {
		logWarn('No exercises found', { action: 'getAllExercises' }, req)
		throw new ApiError(404, 'No exercises found')
	}

	logInfo('Exercises fetched', { action: 'getAllExercises', count: exerciseList.length }, req)
	return res.json(new ApiResponse(200, exerciseList, 'Exercises list fetched successfully'))
})

export const getExerciseById = asyncHandler(async (req, res) => {
	const { id } = req.params

	if (!id) {
		logWarn('Exercise ID is required', { action: 'getExerciseById' }, req)
		throw new ApiError(400, 'Exercise ID is required')
	}

	const exercise = await prisma.exercise.findUnique({
		where: { id },
		include: {
			primaryMuscleGroup: true,
			equipment: true,
			otherMuscleGroups: true,
		},
	})

	if (!exercise) {
		logWarn('Exercise not found', { action: 'getExerciseById', exerciseId: id }, req)
		throw new ApiError(404, 'No exercise exists with the provided ID')
	}

	logInfo('Exercise fetched', { action: 'getExerciseById', exerciseId: id }, req)
	return res.json(new ApiResponse(200, exercise, 'Exercise fetched successfully'))
})

export const updateExercise = asyncHandler(async (req, res) => {
	const { id } = req.params
	const { title, instructions, primaryMuscleGroupId, equipmentId, exerciseType } = req.body
	const video = req.file

	if (!id) {
		logWarn('Exercise ID is required to update Exercise', { action: 'updateExercise' }, req)
		throw new ApiError(400, 'Exercise ID is required')
	}

	const existingExercise = await prisma.exercise.findUnique({ where: { id } })

	if (!existingExercise) {
		logWarn('Exercise not found for update', { action: 'updateExercise', exerciseId: id }, req)
		throw new ApiError(404, 'No exercise exists with the provided ID')
	}

	let newVideoUrl = null
	let newThumbnailUrl = null
	let newVideoKey = null
	let newThumbnailKey = null

	if (video) {
		const filePath = `gym-sass/exercises/${randomUUID()}`
		try {
			const uploaded = await uploadExerciseVideo({
				file: video,
				filePath,
				userId: req.user.id,
			})

			newVideoUrl = uploaded.videoUrl
			newThumbnailUrl = uploaded.thumbnailUrl
			newVideoKey = uploaded.videoKey
			newThumbnailKey = uploaded.thumbnailKey
		} catch (error) {
			logError(
				'Failed to upload new Exercise video',
				{ action: 'updateExercise', exerciseId: id, error: error.message },
				req
			)
			throw new ApiError(500, 'Failed to upload Exercise video', error.message)
		}
	}

	let updatedExercise
	try {
		updatedExercise = await prisma.exercise.update({
			where: { id },
			data: {
				...(title && { title: titleizeString(title) }),
				...(instructions !== undefined && { instructions }),
				...(primaryMuscleGroupId && { primaryMuscleGroupId }),
				...(equipmentId && { equipmentId }),
				...(exerciseType && { exerciseType }),
				...(newVideoUrl && { videoUrl: newVideoUrl }),
				...(newThumbnailUrl && { thumbnailUrl: newThumbnailUrl }),
			},
		})
	} catch (error) {
		if (newVideoKey) {
			await deleteMediaByKey({
				key: newVideoKey,
				userId: req.user.id,
				reason: 'exercise update db failure',
			})
		}

		if (newThumbnailKey) {
			await deleteMediaByKey({
				key: newThumbnailKey,
				userId: req.user.id,
				reason: 'exercise update db failure',
			})
		}

		logError(
			'Failed to update Exercise in DB',
			{ action: 'updateExercise', exerciseId: id, error: error.message },
			req
		)
		throw new ApiError(500, 'Failed to update Exercise', error.message)
	}

	// Delete old media AFTER successful update
	if (video && existingExercise.videoUrl) {
		const oldVideoKey = extractS3KeyFromUrl(existingExercise.videoUrl)
		if (oldVideoKey) {
			await deleteMediaByKey({
				key: oldVideoKey,
				userId: req.user.id,
				reason: 'exercise video replaced',
			})
		}
	}

	if (video && existingExercise.thumbnailUrl) {
		const oldThumbnailKey = extractS3KeyFromUrl(existingExercise.thumbnailUrl)
		if (oldThumbnailKey) {
			await deleteMediaByKey({
				key: oldThumbnailKey,
				userId: req.user.id,
				reason: 'exercise thumbnail replaced',
			})
		}
	}

	logInfo('Exercise updated', { action: 'updateExercise', exerciseId: id }, req)
	return res.json(new ApiResponse(200, updatedExercise, 'Exercise updated successfully'))
})

export const deleteExercise = asyncHandler(async (req, res) => {
	const { id } = req.params

	if (!id) {
		logWarn('Exercise ID is required for deletion', { action: 'deleteExercise' }, req)
		throw new ApiError(400, 'Exercise ID is required')
	}

	const existingExercise = await prisma.exercise.findUnique({ where: { id } })

	if (!existingExercise) {
		logWarn('Exercise not found for deletion', { action: 'deleteExercise', exerciseId: id }, req)
		throw new ApiError(404, 'No exercise exists with the provided ID')
	}

	try {
		const deletedExercise = await prisma.exercise.delete({ where: { id } })

		const videoKey = extractS3KeyFromUrl(existingExercise.videoUrl)
		const thumbnailKey = extractS3KeyFromUrl(existingExercise.thumbnailUrl)

		if (videoKey) {
			await deleteMediaByKey({
				key: videoKey,
				userId: req.user.id,
				reason: 'exercise deleted',
			})
		}

		if (thumbnailKey) {
			await deleteMediaByKey({
				key: thumbnailKey,
				userId: req.user.id,
				reason: 'exercise deleted',
			})
		}

		logInfo('Exercise deleted', { action: 'deleteExercise', exerciseId: id }, req)
		return res.json(new ApiResponse(200, deletedExercise, 'Exercise deleted successfully'))
	} catch (error) {
		logError(
			'Failed to delete Exercise',
			error,
			{ action: 'deleteExercise', exerciseId: id, error: error.message },
			req
		)
		throw new ApiError(500, 'Failed to delete exercise', error.message)
	}
})
