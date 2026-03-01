import { EquipmentType, FitnessGoal, FitnessLevel, Gender, PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logError, logWarn } from '../../common/utils/logger.js'
// import { deleteFromS3, getSignedUrl, uploadToS3 } from '../../common/utils/s3.js'
import {
	deleteMediaByKey,
	deleteProfilePicture,
	extractS3KeyFromUrl,
	UploadedFile,
	uploadMedia,
	uploadProfilePicture,
	uploadVideo,
} from '../../common/services/media.service.js'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient().$extends(withAccelerate())

export const getUser = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req?.params?.id

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: { fitnessProfile: true, measurements: true },
	})

	if (!user) {
		throw new ApiError(404, 'User not found')
	}

	logDebug('User fetched successfully', { action: 'getUser', user }, req)
	res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})

interface UpdateUserBody {
	firstName?: string
	lastName?: string
	dateOfBirth?: string
	preferredWeightUnit?: 'kg' | 'lbs'
	preferredLengthUnit?: 'cm' | 'inches'
	height?: number
	weight?: number
	gender?: Gender
}

export const updateUser = asyncHandler(async (req: Request<{ id: string }, object, UpdateUserBody>, res: Response) => {
	const userId = req.params.id // get user id from params
	const updates = req.body // get fields to update from body

	logDebug('updates logged', updates as unknown as Record<string, unknown>)

	const allowedFields: (keyof UpdateUserBody)[] = [
		'firstName',
		'lastName',
		'dateOfBirth',
		'preferredWeightUnit',
		'preferredLengthUnit',
		'height',
		'weight',
		'gender',
	]
	const fieldsToUpdate: Partial<UpdateUserBody> = {}

	// Check if user exists
	const existingUser = await prisma.user.findUnique({ where: { id: userId } })

	if (!existingUser) {
		logWarn('User does not exist', { action: 'findUser', userId })
		throw new ApiError(404, 'User does not exist')
	}

	// Filter only allowed fields
	for (const field of allowedFields) {
		if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') {
			;(fieldsToUpdate as Record<string, unknown>)[field] = updates[field]
		}
	}

	if (Object.keys(fieldsToUpdate).length <= 0) {
		logWarn('No valid fields provided for updating', { action: 'updateUser' })
		throw new ApiError(404, 'No valid fields provided for update')
	}

	const updatedUser = await prisma.user.update({
		select: {
			firstName: true,
			lastName: true,
			dateOfBirth: true,
			preferredLengthUnit: true,
			preferredWeightUnit: true,
			height: true,
			weight: true,
			gender: true,
			updatedAt: true,
		},
		where: { id: userId },
		data: {
			...fieldsToUpdate,
			dateOfBirth: fieldsToUpdate.dateOfBirth ? new Date(fieldsToUpdate.dateOfBirth) : existingUser.dateOfBirth,
		},
	})

	logDebug('Converting to ISO string', {
		action: 'dateOfBirthToISOString',
		data: {
			...fieldsToUpdate,
			dateOfBirth: fieldsToUpdate.dateOfBirth ? new Date(fieldsToUpdate.dateOfBirth) : existingUser.dateOfBirth,
		},
	})

	return res.status(200).json(new ApiResponse(200, updatedUser, 'Details updated successfully'))
})

export const updateProfilePic = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.params.id
	const file = req.file as UploadedFile | undefined

	if (!file) {
		logWarn('No file provided', { action: 'updateProfilePic' }, req)
		throw new ApiError(400, 'No file provided')
	}

	const user = await prisma.user.findUnique({
		select: { id: true, profilePicUrl: true },
		where: { id: userId },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'updateProfilePic', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	let newProfilePicUrl: string

	try {
		// Upload new image first
		newProfilePicUrl = await uploadProfilePicture(file, userId)
	} catch (error) {
		const err = error as Error
		logWarn('Failed to upload profile picture', { action: 'updateProfilePic', error: err.message }, req)
		throw new ApiError(500, 'Failed to upload profile picture')
	}

	// Update DB with new image
	const updatedUser = await prisma.user.update({
		select: { profilePicUrl: true, updatedAt: true },
		where: { id: userId },
		data: { profilePicUrl: newProfilePicUrl },
	})

	// Delete old image (best-effort, non-blocking)
	if (user.profilePicUrl) {
		try {
			await deleteProfilePicture(userId, user.profilePicUrl)
		} catch (error) {
			const err = error as Error
			// Log but DO NOT fail the request
			logWarn(
				'Failed to delete old profile picture',
				{
					action: 'updateProfilePic',
					userId,
					oldProfilePicUrl: user.profilePicUrl,
					error: err.message,
				},
				req
			)
		}
	}

	logDebug('Profile picture updated successfully', {
		action: 'updateProfilePic',
		userId,
	})

	return res.status(200).json(new ApiResponse(200, updatedUser, 'Profile picture updated successfully'))
})

export const deleteProfilePic = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.params.id

	const user = await prisma.user.findUnique({
		select: { id: true, profilePicUrl: true },
		where: { id: userId },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'deleteProfilePic', userId: userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	try {
		await deleteProfilePicture(userId, user.profilePicUrl!)
	} catch (error) {
		const err = error as Error
		logWarn('Failed to delete profile picture', { action: 'deleteProfilePic', error: err.message }, req)
		throw new ApiError(500, 'Failed to delete profile picture')
	}

	const updatedUser = await prisma.user.update({
		select: {
			id: true,
			phoneE164: true,
			firstName: true,
			lastName: true,
			dateOfBirth: true,
			height: true,
			weight: true,
			profilePicUrl: true,
		},
		where: { id: userId },
		data: { profilePicUrl: null },
	})

	logDebug('Profile picture deleted successfully', { action: 'deleteProfilePic', user: userId })
	return res.status(200).json(new ApiResponse(200, updatedUser, 'Profile picture deleted successfully '))
})

interface UpdateUserFitnessProfileBody {
	fitnessGoal?: FitnessGoal
	fitnessLevel?: FitnessLevel
	targetWeight?: number
	targetDate?: string
	injuries?: string
	availableEquipment?: EquipmentType[]
}

export const updateUserFitnessProfile = asyncHandler(
	async (req: Request<{ id: string }, object, UpdateUserFitnessProfileBody>, res: Response) => {
		const userId = req.params.id
		const updates = req.body as UpdateUserFitnessProfileBody

		const updatedFitnessProfile = await prisma.userFitnessProfile.upsert({
			where: { userId },
			update: {
				...(updates.fitnessGoal !== undefined && { fitnessGoal: updates.fitnessGoal }),
				...(updates.fitnessLevel !== undefined && { fitnessLevel: updates.fitnessLevel }),
				...(updates.targetWeight !== undefined && { targetWeight: updates.targetWeight }),
				...(updates.targetDate !== undefined && {
					targetDate: updates.targetDate ? new Date(updates.targetDate) : null,
				}),
				...(updates.injuries !== undefined && { injuries: updates.injuries }),
				...(updates.availableEquipment !== undefined && {
					availableEquipment: updates.availableEquipment,
				}),
			},
			create: {
				userId,
				fitnessGoal: updates.fitnessGoal ?? null,
				fitnessLevel: updates.fitnessLevel ?? null,
				targetWeight: updates.targetWeight ?? null,
				targetDate: updates.targetDate ? new Date(updates.targetDate) : null,
				injuries: updates.injuries ?? null,
				availableEquipment: updates.availableEquipment ?? [],
			},
		})

		logDebug('User fitness profile updated successfully', { action: 'updateUserFitnessProfile', user: userId })
		return res
			.status(200)
			.json(new ApiResponse(200, updatedFitnessProfile, 'User fitness profile updated successfully '))
	}
)

interface AddDailyMeasurementBody {
	date: string
	weight?: number
	waist?: number
	bodyFat?: number
	leanBodyMass?: number
	neck?: number
	shoulders?: number
	chest?: number
	leftBicep?: number
	rightBicep?: number
	leftForearm?: number
	rightForearm?: number
	abdomen?: number
	hips?: number
	leftThigh?: number
	rightThigh?: number
	leftCalf?: number
	rightCalf?: number
	notes?: string
}

export const addDailyMeasurement = asyncHandler(
	async (req: Request<{ id: string }, object, AddDailyMeasurementBody>, res: Response) => {
		const userId = req.params.id
		const {
			date,
			weight,
			bodyFat,
			chest,
			waist,
			neck,
			shoulders,
			leftBicep,
			rightBicep,
			leftForearm,
			rightForearm,
			abdomen,
			hips,
			leftThigh,
			rightThigh,
			leftCalf,
			rightCalf,
			notes,
		} = req.body

		const parsedDate = new Date(date)

		const files = req.files as Express.Multer.File[] | undefined
		const progressPicUrls: string[] = []
		const uploadedKeys: string[] = []

		if (files && files.length > 0) {
			const uploadPromises = files.map(async file => {
				const tempFile: UploadedFile = {
					buffer: file.buffer,
					size: file.size,
					mimetype: file.mimetype,
					originalname: file.originalname,
				}
				const filePath = `gym-sass/measurements/${userId}/${randomUUID()}`

				if (file.mimetype.startsWith('video/')) {
					const uploaded = await uploadVideo({
						file: tempFile,
						mediaType: 'progressVideo',
						filePath,
						userId,
					})
					uploadedKeys.push(uploaded.videoKey)
					return uploaded.videoUrl
				} else {
					const url = await uploadMedia({
						file: tempFile,
						mediaType: 'progressPic',
						filePath,
						userId,
					})
					const key = extractS3KeyFromUrl(url)
					if (key) uploadedKeys.push(key)
					return url
				}
			})

			try {
				const urls = await Promise.all(uploadPromises)
				progressPicUrls.push(...urls)
			} catch (error) {
				const err = error as Error
				for (const key of uploadedKeys) {
					await deleteMediaByKey({ key, userId, reason: 'Failed during multi-upload' })
				}
				logError(
					'Failed to upload daily measurement media',
					err,
					{ action: 'addDailyMeasurement', userId },
					req
				)
				throw new ApiError(500, 'Failed to upload daily measurement media')
			}
		}

		try {
			const measurement = await prisma.userMeasurement.upsert({
				where: {
					userId_date: {
						userId,
						date: parsedDate,
					},
				},
				update: {
					...(weight !== undefined && { weight }),
					...(bodyFat !== undefined && { bodyFat }),
					...(chest !== undefined && { chest }),
					...(waist !== undefined && { waist }),
					...(neck !== undefined && { neck }),
					...(shoulders !== undefined && { shoulders }),
					...(leftBicep !== undefined && { leftBicep }),
					...(rightBicep !== undefined && { rightBicep }),
					...(leftForearm !== undefined && { leftForearm }),
					...(rightForearm !== undefined && { rightForearm }),
					...(abdomen !== undefined && { abdomen }),
					...(hips !== undefined && { hips }),
					...(leftThigh !== undefined && { leftThigh }),
					...(rightThigh !== undefined && { rightThigh }),
					...(leftCalf !== undefined && { leftCalf }),
					...(rightCalf !== undefined && { rightCalf }),
					...(notes !== undefined && { notes }),
					...(progressPicUrls.length > 0 && {
						progressPicUrls: { push: progressPicUrls },
					}),
				},
				create: {
					userId,
					date: parsedDate,
					weight: weight ?? null,
					bodyFat: bodyFat ?? null,
					waist: waist ?? null,
					neck: neck ?? null,
					shoulders: shoulders ?? null,
					chest: chest ?? null,
					leftBicep: leftBicep ?? null,
					rightBicep: rightBicep ?? null,
					leftForearm: leftForearm ?? null,
					rightForearm: rightForearm ?? null,
					abdomen: abdomen ?? null,
					hips: hips ?? null,
					leftThigh: leftThigh ?? null,
					rightThigh: rightThigh ?? null,
					leftCalf: leftCalf ?? null,
					rightCalf: rightCalf ?? null,
					notes: notes ?? null,
					progressPicUrls,
				},
			})

			logDebug('Added daily measurement', { action: 'addDailyMeasurement', userId })
			return res.status(200).json(new ApiResponse(200, measurement, 'Daily measurement saved successfully'))
		} catch (error) {
			const err = error as Error
			// Roll back uploaded media if DB failed
			for (const key of uploadedKeys) {
				await deleteMediaByKey({
					key,
					userId,
					reason: 'daily measurement db update failure',
				})
			}
			logError('Failed to save daily measurement in DB', err, { action: 'addDailyMeasurement', userId }, req)
			throw new ApiError(500, 'Failed to save daily measurement')
		}
	}
)

export const getMeasurementHistory = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.params.id
	const limit = parseInt(req.query.limit as string) || 30 // default fetch last 30 measurements

	const measurements = await prisma.userMeasurement.findMany({
		where: { userId },
		orderBy: { date: 'desc' },
		take: limit,
	})

	logDebug('Fetched measurement history', { action: 'getMeasurementHistory', userId })
	return res.status(200).json(new ApiResponse(200, measurements, 'Measurements fetched successfully'))
})

export const getUserFitnessProfile = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.params.id
	const fitnessProfile = await prisma.userFitnessProfile.findUnique({
		where: { userId },
	})
	logDebug('Fetched user fitness profile', { action: 'getUserFitnessProfile', userId })
	return res.status(200).json(new ApiResponse(200, fitnessProfile, 'User fitness profile fetched successfully'))
})
