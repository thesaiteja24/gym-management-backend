import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logWarn } from '../../common/utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const followUser = asyncHandler(async (req: Request<{ id: string }, {}, {}>, res: Response) => {
	const currentUserId = req.user?.id as string
	const targetUserId = req.params.id

	if (currentUserId === targetUserId) {
		logWarn('You cannot follow yourself', { action: 'followUser' }, req)
		throw new ApiError(400, 'You cannot follow yourself')
	}

	const user = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: { id: true },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'followUser', userId: targetUserId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const result = await prisma.$transaction([
		prisma.follow.create({
			data: {
				followerId: currentUserId,
				followingId: targetUserId,
			},
		}),
		prisma.user.update({
			where: { id: currentUserId },
			data: {
				followingCount: { increment: 1 },
			},
		}),
		prisma.user.update({
			where: { id: targetUserId },
			data: { followersCount: { increment: 1 } },
		}),
	])

	logDebug('Following', { result }, req)
	return res.status(200).json(new ApiResponse(200, result, 'Your now following'))
})

export const unFollowUser = asyncHandler(async (req: Request<{ id: string }, {}, {}>, res: Response) => {
	const currentUserId = req.user?.id as string
	const targetUserId = req.params.id

	if (currentUserId === targetUserId) {
		logWarn('You cannot unfollow yourself', { action: 'unfollowUser' }, req)
		throw new ApiError(400, 'You cannot unfollow yourself')
	}

	const user = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: { id: true },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'unfollowUser', userId: targetUserId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const result = await prisma.$transaction([
		prisma.follow.delete({
			where: {
				followerId_followingId: {
					followerId: currentUserId,
					followingId: targetUserId,
				},
			},
		}),
		prisma.user.update({
			where: { id: currentUserId },
			data: {
				followingCount: { decrement: 1 },
			},
		}),
		prisma.user.update({
			where: { id: targetUserId },
			data: { followersCount: { decrement: 1 } },
		}),
	])

	logDebug('Following', { result }, req)
	return res.status(200).json(new ApiResponse(200, result, 'Your have unfollowed'))
})

export const getUserFollowing = asyncHandler(async (req: Request<{ id: string }, {}, {}>, res: Response) => {
	const userId = req.params.id
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'getUserFollowers', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const followers = await prisma.follow.findMany({
		where: { followerId: userId },
		select: {
			following: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
					followers: {
						where: {
							followerId: userId,
						},
						select: {
							followerId: true,
						},
					},
				},
			},
		},
	})

	const result = followers.map(follower => ({
		...follower.following,
		isFollowing: follower.following.followers.length > 0,
	}))

	logDebug('User followers fetched successfully', { action: 'getUserFollowers', user: userId, result: result }, req)
	return res.status(200).json(new ApiResponse(200, result, 'User followers fetched successfully'))
})

export const getUserFollowers = asyncHandler(async (req: Request<{ id: string }, {}, {}>, res: Response) => {
	const userId = req.params.id
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true },
	})

	if (!user) {
		logWarn('User does not exist', { action: 'getUserFollowers', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const followers = await prisma.follow.findMany({
		where: { followingId: userId },
		select: {
			follower: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
					followers: {
						where: {
							followerId: userId,
						},
						select: {
							followerId: true,
						},
					},
				},
			},
		},
	})

	const result = followers.map(follower => ({
		...follower.follower,
		isFollowing: follower.follower.followers.length > 0,
	}))

	logDebug('User followers fetched successfully', { action: 'getUserFollowers', user: userId, result: result }, req)
	return res.status(200).json(new ApiResponse(200, result, 'User followers fetched successfully'))
})
