import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { ApiError } from '../utils/ApiError.js'
import { logDebug, logWarn } from '../utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const getUser = asyncHandler(async (req, res) => {
	// Input validation
	const userId = req?.params?.id
	if (!userId) {
		throw new ApiError(400, 'User ID is required')
	}

	const user = await prisma.user.findUnique({
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
	})

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

	const allowedFields = ['firstName', 'lastName', 'dateOfBirth', 'height', 'weight']
	const fieldsToUpdate = {}

	// Check if user exists
	const existingUser = await prisma.user.findUnique({
		select: {
			id: true,
			firstName: true,
			lastName: true,
			dateOfBirth: true,
			height: true,
			weight: true,
		},
		where: { id: userId },
	})

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