import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { ApiError } from '../utils/ApiError.js'
import { logDebug, logWarn } from '../utils/logger.js'
import { deleteProfilePicture, uploadProfilePicture } from '../services/media.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const getUser = asyncHandler(async (req, res) => {
	// Input validation
	const userId = req?.params?.id
	if (!userId) {
		throw new ApiError(400, 'User ID is required')
	}

	const user = await prisma.user.findUnique({ where: { id: userId } })

	if (!user) {
		throw new ApiError(404, 'User not found')
	}

	res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})

export const updateUser = asyncHandler(async (req, res) => {
	const userId = req.params.id // get user id from params
	const updates = req.body // get fileds to update from body

	// Input validation
	if (!userId) {
		logWarn('User id is required')
		throw new ApiError(400, 'User ID is required')
	}

	logDebug('updates logged', updates)

	const allowedFields = [
		'firstName',
		'lastName',
		'dateOfBirth',
		'preferredWeightUnit',
		'preferredLengthUnit',
		'height',
		'weight',
	]
	const fieldsToUpdate = {}

	// Check if user exists
	const existingUser = await prisma.user.findUnique({ where: { id: userId } })

	if (!existingUser) {
		logWarn('User does not exist', { action: 'findUser', userId })
		throw new ApiError(404, 'User does not exist')
	}

	// Filter only allowed fields
	for (const field of allowedFields) {
		if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') {
			fieldsToUpdate[field] = updates[field]
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

export const updateProfilePic = asyncHandler(async (req, res) => {
	const userId = req.params.id
	const file = req.file

	if (!userId) {
		logWarn('User id is required', { action: 'updateProfilePic' }, req)
		throw new ApiError(400, 'User ID is required')
	}

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

	let newProfilePicUrl

	try {
		// Upload new image first
		newProfilePicUrl = await uploadProfilePicture(file, userId)
	} catch (error) {
		logWarn('Failed to upload profile picture', { action: 'updateProfilePic', error: error.message }, req)
		throw new ApiError(500, 'Failed to upload profile picture', error.message)
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
			// Log but DO NOT fail the request
			logWarn(
				'Failed to delete old profile picture',
				{
					action: 'updateProfilePic',
					userId,
					oldProfilePicUrl: user.profilePicUrl,
					error: error.message,
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

export const deleteProfilePic = asyncHandler(async (req, res) => {
	const userId = req.params.id

	if (!userId) {
		logWarn('User id is required', { action: 'deleteProfilePic' }, req)
		throw new ApiError(400, 'User id is required')
	}

	const user = await prisma.user.findUnique({
		select: { id: true, profilePicUrl: true },
		where: { id: userId },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'deleteProfilePic', userId: userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	let deleted
	try {
		deleted = await deleteProfilePicture(userId, user.profilePicUrl)
	} catch (error) {
		logWarn('Failed to delete profile picture', { action: 'deleteProfilePic', error: error.message }, req)
		throw new ApiError(500, 'Failed to delete profile picture', error.message)
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
