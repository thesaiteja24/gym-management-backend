import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logWarn } from '../../common/utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
	const query = req.query.query as string

	if (!query) {
		logWarn('No query provided', { action: 'searchUsers' }, req)
		throw new ApiError(400, 'No query provided')
	}
	logDebug('Query', { action: 'searchUsers', query }, req)

	const results = await prisma.user.findMany({
		where: {
			OR: [
				{
					firstName: {
						startsWith: query,
						mode: 'insensitive',
					},
				},
				{
					lastName: {
						startsWith: query,
						mode: 'insensitive',
					},
				},
			],
		},
		take: 20,
		select: {
			id: true,
			profilePicUrl: true,
			firstName: true,
			lastName: true,
			isPro: true,
			proSubscriptionType: true,
		},
	})

	return res.status(200).json(new ApiResponse(200, results, 'Users fetched successfully'))
})

export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
	const currentUserId = req.user?.id
	logWarn('currentUserId', { action: 'getSuggestedUsers', currentUserId: currentUserId }, req)
	const users = await prisma.user.findMany({
		where: {
			id: {
				not: currentUserId,
			},
		},
		select: {
			id: true,
			profilePicUrl: true,
			firstName: true,
			lastName: true,
			isPro: true,
			proSubscriptionType: true,
			followers: {
				where: {
					followerId: currentUserId,
				},
				select: {
					followerId: true,
				},
			},
		},
		take: 20,
	})

	const result = users.map(user => ({
		id: user.id,
		profilePicUrl: user.profilePicUrl,
		firstName: user.firstName,
		lastName: user.lastName,
		isFollowing: user.followers.length > 0,
	}))

	return res.status(200).json(new ApiResponse(200, result, 'Users fetched successfully'))
})
