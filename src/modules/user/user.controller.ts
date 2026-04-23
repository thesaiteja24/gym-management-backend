import { Gender, PrismaClient, User } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logError, logWarn } from '../../common/utils/logger.js'
import { deleteProfilePicture, UploadedFile, uploadProfilePicture } from '../../common/services/media.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const selfUserSelect = {
	id: true,
	firstName: true,
	lastName: true,
	profilePicUrl: true,
	followersCount: true,
	followingCount: true,
	isPro: true,
	proSubscriptionType: true,
	email: true,
	countryCode: true,
	phone: true,
	height: true,
	weight: true,
	preferredLengthUnit: true,
	preferredWeightUnit: true,
	dateOfBirth: true,
	gender: true,
	role: true,
	privacyPolicyAcceptedAt: true,
	privacyPolicyVersion: true,
	phoneE164: true,
	createdAt: true,
	updatedAt: true,
}

export const publicUserSelect = {
	id: true,
	firstName: true,
	lastName: true,
	profilePicUrl: true,
	followersCount: true,
	followingCount: true,
	isPro: true,
	proSubscriptionType: true,
}

export function formatUserResponse(user: any) {
	if (!user) return null
	return {
		...user,
		height: user.height?.toNumber?.() ?? user.height ?? null,
		weight: user.weight?.toNumber?.() ?? user.weight ?? null,
		dateOfBirth: user.dateOfBirth?.toISOString?.() ?? user.dateOfBirth ?? null,
	}
}

export const getUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const userId = req.params.userId
	const currentUserId = req.user?.id

	const isSelf = currentUserId === userId

	if (isSelf) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: selfUserSelect,
		})

		if (!user) {
			throw new ApiError(404, 'User not found')
		}

		return res.status(200).json(new ApiResponse(200, formatUserResponse(user), 'User fetched successfully'))
	}

	// PUBLIC branch
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: publicUserSelect,
	})

	if (!user) {
		throw new ApiError(404, 'User not found')
	}

	return res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
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

export const updateUser = asyncHandler(
	async (req: Request<{ userId: string }, object, UpdateUserBody>, res: Response) => {
		const userId = req.params.userId // get user id from params
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
			select: selfUserSelect,
			where: { id: userId },
			data: {
				...fieldsToUpdate,
				dateOfBirth: fieldsToUpdate.dateOfBirth
					? new Date(fieldsToUpdate.dateOfBirth)
					: existingUser.dateOfBirth,
			},
		})

		logDebug('Converting to ISO string', {
			action: 'dateOfBirthToISOString',
			data: {
				...fieldsToUpdate,
				dateOfBirth: fieldsToUpdate.dateOfBirth
					? new Date(fieldsToUpdate.dateOfBirth)
					: existingUser.dateOfBirth,
			},
		})

		return res
			.status(200)
			.json(new ApiResponse(200, formatUserResponse(updatedUser), 'Details updated successfully'))
	}
)

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
		select: selfUserSelect,
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

	return res
		.status(200)
		.json(new ApiResponse(200, formatUserResponse(updatedUser), 'Profile picture updated successfully'))
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
		select: selfUserSelect,
		where: { id: userId },
		data: { profilePicUrl: null },
	})

	logDebug('Profile picture deleted successfully', { action: 'deleteProfilePic', user: userId })
	return res
		.status(200)
		.json(new ApiResponse(200, formatUserResponse(updatedUser), 'Profile picture deleted successfully '))
})
