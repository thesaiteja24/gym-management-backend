import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logInfo, logWarn } from '../../common/utils/logger.js'

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

// Post related
export const createComment = asyncHandler(
	async (req: Request<{ id: string }, object, { content: string; parentId?: string }>, res: Response) => {
		const userId = req.user?.id
		const workoutId = req.params.id
		const { content, parentId } = req.body

		const existingUser = await prisma.user.findUnique({
			where: { id: userId },
		})

		if (!existingUser) {
			logWarn(`User with the user id:${userId}`, { action: 'createComment', userId }, req)
			throw new ApiError(404, 'User does not exist')
		}

		const existingWorkout = await prisma.workoutLog.findUnique({
			where: { id: workoutId },
		})

		if (!existingWorkout) {
			logWarn(`Workout with the workout id:${workoutId}`, { action: 'createComment', workoutId }, req)
			throw new ApiError(404, 'Workout does not exist')
		}

		if (parentId) {
			const existingCommnet = await prisma.workoutComment.findUnique({
				where: { id: parentId },
			})

			if (!existingCommnet) {
				logWarn(`Comment with the comment id:${parentId}`, { action: 'createComment', parentId }, req)
				throw new ApiError(404, 'Comment does not exist')
			}

			if (existingCommnet.workoutId !== workoutId) {
				logWarn(
					`Comment with the comment id:${parentId} is not the parent of the workout with the workout id:${workoutId}`,
					{ action: 'createComment', parentId, workoutId },
					req
				)
				throw new ApiError(403, 'This comment does not belong to this workout')
			}
		}

		const comment = await prisma.workoutComment.create({
			data: {
				workoutId,
				userId: userId!,
				content,
				parentId: parentId ?? null,
			},
			select: {
				id: true,
				workoutId: true,
				userId: true,
				content: true,
				parentId: true,
				likesCount: true,
				createdAt: true,
				updatedAt: true,
				deletedAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePicUrl: true,
					},
				},
				_count: {
					select: { replies: true }, // Get the total count of direct replies without loading them
				},
			},
		})

		logInfo('Comment created successfully', { action: 'createComment', workoutId, parentId }, req)
		return res.status(200).json(new ApiResponse(200, comment, 'Comment created successfully'))
	}
)

export const getComments = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const workoutId = req.params.id
	const limit = parseInt((req.query.limit as string) || '20', 10)
	const cursor = req.query.cursor as string

	// Fetch the top-level comments (parentId is null)
	const comments = await prisma.workoutComment.findMany({
		where: { workoutId, parentId: null },
		take: limit + 1, // Fetch an extra item to check if there's a next page
		cursor: cursor ? { id: cursor } : undefined,
		orderBy: {
			createdAt: 'desc', // Order top-level comments by creation time (newest first)
		},
		select: {
			id: true,
			workoutId: true,
			userId: true,
			content: true,
			parentId: true,
			likesCount: true,
			createdAt: true,
			updatedAt: true,
			deletedAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
			_count: {
				select: { replies: true }, // Get the total count of direct replies without loading them
			},
		},
	})

	let nextCursor: string | null = null
	if (comments.length > limit) {
		const nextItem = comments.pop() // Remove the extra item
		nextCursor = nextItem!.id
	}

	const formattedComments = comments.map(comment => {
		const isDeleted = !!comment.deletedAt
		return {
			...comment,
			content: isDeleted ? '[This comment has been deleted]' : comment.content,
			user: isDeleted ? null : comment.user,
		}
	})

	logInfo('Comments fetched successfully', { action: 'getComments', workoutId }, req)
	return res
		.status(200)
		.json(new ApiResponse(200, { comments: formattedComments, nextCursor }, 'Comments fetched successfully'))
})

export const getReplies = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const commentId = req.params.id
	const limit = parseInt((req.query.limit as string) || '10', 10)
	const cursor = req.query.cursor as string

	const replies = await prisma.workoutComment.findMany({
		where: { parentId: commentId },
		take: limit + 1,
		cursor: cursor ? { id: cursor } : undefined,
		orderBy: {
			createdAt: 'asc', // Order replies by creation time (oldest first, typical for reading threads)
		},
		select: {
			id: true,
			workoutId: true,
			userId: true,
			content: true,
			parentId: true,
			likesCount: true,
			createdAt: true,
			updatedAt: true,
			deletedAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
			_count: {
				select: { replies: true }, // Allow replies to have their own replies (infinite nesting)
			},
		},
	})

	let nextCursor: string | null = null
	if (replies.length > limit) {
		const nextItem = replies.pop()
		nextCursor = nextItem!.id
	}

	const formattedReplies = replies.map(reply => {
		const isDeleted = !!reply.deletedAt
		return {
			...reply,
			content: isDeleted ? '[This comment has been deleted]' : reply.content,
			user: isDeleted ? null : reply.user,
		}
	})

	logInfo('Replies fetched successfully', { action: 'getReplies', parentId: commentId }, req)
	return res
		.status(200)
		.json(new ApiResponse(200, { replies: formattedReplies, nextCursor }, 'Replies fetched successfully'))
})

export const editComment = asyncHandler(async (req: Request, res: Response) => {})

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {})

export const deleteCommentReply = asyncHandler(async (req: Request, res: Response) => {})

export const createLike = asyncHandler(async (req: Request, res: Response) => {})

export const deleteLike = asyncHandler(async (req: Request, res: Response) => {})
