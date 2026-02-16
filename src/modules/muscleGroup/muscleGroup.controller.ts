import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { randomUUID } from 'crypto'
import { logError, logInfo, logWarn } from '../../common/utils/logger.js'
import { uploadMedia, deleteMediaByKey, extractS3KeyFromUrl, UploadedFile } from '../../common/services/media.service.js'
import { titleizeString } from '../../common/utils/helpers.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'

const prisma = new PrismaClient().$extends(withAccelerate())

interface CreateMuscleGroupBody {
	title: string
}

export const createMuscleGroup = asyncHandler(
	async (req: Request<object, object, CreateMuscleGroupBody>, res: Response) => {
		const { title } = req.body
		const image = req.file as UploadedFile | undefined

		if (!image) {
			logWarn('MuscleGroup image not provided', { action: 'createMuscleGroup' }, req)
			throw new ApiError(400, 'Image file is required')
		}

		const filePath = `gym-sass/muscle-group/${randomUUID()}`
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
			logError(
				'Failed to upload MuscleGroup image',
				err,
				{ action: 'createMuscleGroup', error: err.message },
				req
			)
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
			const err = error as Error & { code?: string }
			// rollback uploaded image
			await deleteMediaByKey({
				key: mediaKey,
				userId: req.user!.id,
				reason: 'muscleGroup create db failure',
			})

			if (err.code === 'P2002') {
				logWarn('MuscleGroup with this title already exists', { action: 'createMuscleGroup' }, req)
				throw new ApiError(400, 'MuscleGroup with this title already exists')
			}
			logError('Failed to create MuscleGroup in DB', err, { action: 'createMuscleGroup' }, req)
			throw new ApiError(500, 'Failed to create MuscleGroup')
		}
	}
)

export const getAllMuscleGroups = asyncHandler(async (req: Request, res: Response) => {
	const muscleGroupList = await prisma.muscleGroup.findMany({
		orderBy: { title: 'asc' },
	})

	if (!muscleGroupList.length) {
		logWarn('No MuscleGroups found', { action: 'getAllMuscleGroups' }, req)
		throw new ApiError(404, 'No MuscleGroups found')
	}

	logInfo('MuscleGroup list fetched', { action: 'getAllMuscleGroups', count: muscleGroupList.length }, req)
	return res.json(new ApiResponse(200, muscleGroupList, 'MuscleGroups list fetched successfully'))
})

export const getMuscleGroupById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const { id } = req.params

	const muscleGroup = await prisma.muscleGroup.findUnique({
		where: { id },
	})

	if (!muscleGroup) {
		logWarn('MuscleGroup not found', { action: 'getMuscleGroupById', muscleGroupId: id }, req)
		throw new ApiError(404, 'No MuscleGroup exists with the provided ID')
	}

	logInfo('MuscleGroup fetched', { action: 'getMuscleGroupById', muscleGroupId: id }, req)
	return res.json(new ApiResponse(200, muscleGroup, 'MuscleGroup fetched successfully'))
})

interface UpdateMuscleGroupBody {
	title?: string
}

export const updateMuscleGroup = asyncHandler(
	async (req: Request<{ id: string }, object, UpdateMuscleGroupBody>, res: Response) => {
		const { id } = req.params
		const { title } = req.body
		const image = req.file as UploadedFile | undefined

		const existingMuscleGroup = await prisma.muscleGroup.findUnique({
			where: { id },
		})

		if (!existingMuscleGroup) {
			logWarn('MuscleGroup to update not found', { action: 'updateMuscleGroup', muscleGroupId: id }, req)
			throw new ApiError(404, 'No MuscleGroup exists with the provided ID')
		}

		let newThumbnailUrl: string | null = null
		let newMediaKey: string | null = null

		if (image) {
			const filePath = `gym-sass/muscle-group/${randomUUID()}`
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
					'Failed to upload new MuscleGroup image',
					err,
					{ action: 'updateMuscleGroup', muscleGroupId: id, error: err.message },
					req
				)
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
		} catch (error) {
			const err = error as Error
			if (newMediaKey) {
				await deleteMediaByKey({
					key: newMediaKey,
					userId: req.user!.id,
					reason: 'muscleGroup update db failure',
				})
			}
			logError(
				'Failed to update MuscleGroup in DB',
				err,
				{ action: 'updateMuscleGroup', muscleGroupId: id, error: err.message },
				req
			)
			throw new ApiError(500, 'Failed to update MuscleGroup')
		}

		// delete old image after success
		if (image && existingMuscleGroup.thumbnailUrl) {
			const oldKey = extractS3KeyFromUrl(existingMuscleGroup.thumbnailUrl)
			if (oldKey) {
				await deleteMediaByKey({
					key: oldKey,
					userId: req.user!.id,
					reason: 'muscleGroup image replaced',
				})
			}
		}

		logInfo('MuscleGroup updated', { action: 'updateMuscleGroup', muscleGroupId: id }, req)
		return res.json(new ApiResponse(200, updatedMuscleGroup, 'MuscleGroup updated successfully'))
	}
)

export const deleteMuscleGroup = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const { id } = req.params

	const existingMuscleGroup = await prisma.muscleGroup.findUnique({
		where: { id },
	})

	if (!existingMuscleGroup) {
		logWarn('MuscleGroup to delete not found', { action: 'deleteMuscleGroup', muscleGroupId: id }, req)
		throw new ApiError(404, 'No MuscleGroup exists with the provided ID')
	}

	try {
		const deletedMuscleGroup = await prisma.muscleGroup.delete({
			where: { id },
		})

		const thumbnailKey = extractS3KeyFromUrl(existingMuscleGroup.thumbnailUrl)

		// cleanup media (best effort)
		if (thumbnailKey) {
			await deleteMediaByKey({
				key: thumbnailKey,
				userId: req.user!.id,
				reason: 'muscleGroup deleted',
			})
		}

		logInfo('MuscleGroup deleted', { action: 'deleteMuscleGroup', muscleGroupId: id }, req)
		return res.json(new ApiResponse(200, deletedMuscleGroup, 'MuscleGroup deleted successfully'))
	} catch (error) {
		const err = error as Error
		logError(
			'Failed to delete MuscleGroup',
			err,
			{ action: 'deleteMuscleGroup', muscleGroupId: id, error: err.message },
			req
		)
		throw new ApiError(500, 'Failed to delete MuscleGroup')
	}
})
