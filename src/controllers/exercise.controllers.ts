import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient, ExerciseType } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { deleteMediaByKey, extractS3KeyFromUrl, uploadExerciseVideo, UploadedFile } from '../services/media.service.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { titleizeString } from '../utils/helpers.js'
import { randomUUID } from 'crypto'
import { deleteCache, getCache, setCache } from '../services/caching.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

const GET_ALL_EXERCISES_CACHE_KEY = 'exercises:all'
const EXERCISES_CACHE_TTL = '24hr'

interface CreateExerciseBody {
	title: string
	instructions?: string
	primaryMuscleGroupId?: string
	equipmentId?: string
	exerciseType: ExerciseType
}

export const createExercise = asyncHandler(async (req: Request<object, object, CreateExerciseBody>, res: Response) => {
	const { title, instructions, primaryMuscleGroupId, equipmentId, exerciseType } = req.body
	const video = req.file as UploadedFile | undefined

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
	let uploaded: Awaited<ReturnType<typeof uploadExerciseVideo>>

	try {
		uploaded = await uploadExerciseVideo({
			file: video,
			filePath,
			userId: req.user!.id,
		})
	} catch (error) {
		const err = error as Error
		logError('Failed to upload Exercise media', err, { action: 'createExercise', error: err.message }, req)
		throw new ApiError(500, 'Failed to upload exercise media')
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

		// invalidate cache
		await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)

		logInfo('Exercise created', { action: 'createExercise', exerciseId: exercise.id }, req)
		return res.json(new ApiResponse(200, exercise, 'Exercise created successfully'))
	} catch (error) {
		const err = error as Error
		await deleteMediaByKey({
			key: uploaded.videoKey,
			userId: req.user!.id,
			reason: 'exercise create db failure',
		})

		await deleteMediaByKey({
			key: uploaded.thumbnailKey,
			userId: req.user!.id,
			reason: 'exercise create db failure',
		})

		logError('Failed to create Exercise in DB', err, { action: 'createExercise', error: err.message }, req)
		throw new ApiError(500, 'Failed to create exercise')
	}
})

export const getAllExercises = asyncHandler(async (req: Request, res: Response) => {
	const cachedExerciseList = await getCache<unknown[]>(GET_ALL_EXERCISES_CACHE_KEY)

	if (cachedExerciseList) {
		logInfo('Exercises fetched from cache', { action: 'getAllExercises', count: cachedExerciseList.length }, req)
		return res.json(new ApiResponse(200, cachedExerciseList, 'Exercises list fetched successfully '))
	}

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

	try {
		await setCache(GET_ALL_EXERCISES_CACHE_KEY, exerciseList, EXERCISES_CACHE_TTL)
	} catch (error) {
		const err = error as Error
		logError('Failed to cache exercises list', err, { action: 'getAllExercises', error: err.message }, req)
	}

	logInfo('Exercises fetched', { action: 'getAllExercises', count: exerciseList.length }, req)
	return res.json(new ApiResponse(200, exerciseList, 'Exercises list fetched successfully'))
})

export const getExerciseById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
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

interface UpdateExerciseBody {
	title?: string
	instructions?: string
	primaryMuscleGroupId?: string
	equipmentId?: string
	exerciseType?: ExerciseType
}

export const updateExercise = asyncHandler(
	async (req: Request<{ id: string }, object, UpdateExerciseBody>, res: Response) => {
		const { id } = req.params
		const { title, instructions, primaryMuscleGroupId, equipmentId, exerciseType } = req.body
		const video = req.file as UploadedFile | undefined

		if (!id) {
			logWarn('Exercise ID is required to update Exercise', { action: 'updateExercise' }, req)
			throw new ApiError(400, 'Exercise ID is required')
		}

		const existingExercise = await prisma.exercise.findUnique({ where: { id } })

		if (!existingExercise) {
			logWarn('Exercise not found for update', { action: 'updateExercise', exerciseId: id }, req)
			throw new ApiError(404, 'No exercise exists with the provided ID')
		}

		let newVideoUrl: string | null = null
		let newThumbnailUrl: string | null = null
		let newVideoKey: string | null = null
		let newThumbnailKey: string | null = null

		if (video) {
			const filePath = `gym-sass/exercises/${randomUUID()}`
			try {
				const uploaded = await uploadExerciseVideo({
					file: video,
					filePath,
					userId: req.user!.id,
				})

				newVideoUrl = uploaded.videoUrl
				newThumbnailUrl = uploaded.thumbnailUrl
				newVideoKey = uploaded.videoKey
				newThumbnailKey = uploaded.thumbnailKey
			} catch (error) {
				const err = error as Error
				logError(
					'Failed to upload new Exercise video',
					err,
					{ action: 'updateExercise', exerciseId: id, error: err.message },
					req
				)
				throw new ApiError(500, 'Failed to upload Exercise video')
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
			const err = error as Error
			if (newVideoKey) {
				await deleteMediaByKey({
					key: newVideoKey,
					userId: req.user!.id,
					reason: 'exercise update db failure',
				})
			}

			if (newThumbnailKey) {
				await deleteMediaByKey({
					key: newThumbnailKey,
					userId: req.user!.id,
					reason: 'exercise update db failure',
				})
			}

			logError(
				'Failed to update Exercise in DB',
				err,
				{ action: 'updateExercise', exerciseId: id, error: err.message },
				req
			)
			throw new ApiError(500, 'Failed to update Exercise')
		}

		// Delete old media AFTER successful update
		if (video && existingExercise.videoUrl) {
			const oldVideoKey = extractS3KeyFromUrl(existingExercise.videoUrl)
			if (oldVideoKey) {
				await deleteMediaByKey({
					key: oldVideoKey,
					userId: req.user!.id,
					reason: 'exercise video replaced',
				})
			}
		}

		if (video && existingExercise.thumbnailUrl) {
			const oldThumbnailKey = extractS3KeyFromUrl(existingExercise.thumbnailUrl)
			if (oldThumbnailKey) {
				await deleteMediaByKey({
					key: oldThumbnailKey,
					userId: req.user!.id,
					reason: 'exercise thumbnail replaced',
				})
			}
		}

		// invalidate cache
		await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)

		logInfo('Exercise updated', { action: 'updateExercise', exerciseId: id }, req)
		return res.json(new ApiResponse(200, updatedExercise, 'Exercise updated successfully'))
	}
)

export const deleteExercise = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
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
				userId: req.user!.id,
				reason: 'exercise deleted',
			})
		}

		if (thumbnailKey) {
			await deleteMediaByKey({
				key: thumbnailKey,
				userId: req.user!.id,
				reason: 'exercise deleted',
			})
		}

		// invalidate cache
		await deleteCache(GET_ALL_EXERCISES_CACHE_KEY)

		logInfo('Exercise deleted', { action: 'deleteExercise', exerciseId: id }, req)
		return res.json(new ApiResponse(200, deletedExercise, 'Exercise deleted successfully'))
	} catch (error) {
		const err = error as Error
		logError(
			'Failed to delete Exercise',
			err,
			{ action: 'deleteExercise', exerciseId: id, error: err.message },
			req
		)
		throw new ApiError(500, 'Failed to delete exercise')
	}
})
