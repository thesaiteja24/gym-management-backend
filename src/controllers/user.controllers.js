import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { ApiError } from '../utils/ApiError.js'

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
