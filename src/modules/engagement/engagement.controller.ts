import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
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

		const comment = await prisma.$transaction([
			prisma.workoutComment.create({
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
			}),
			prisma.workoutLog.update({
				where: { id: workoutId },
				data: {
					commentsCount: { increment: 1 },
				},
			}),
		])

		logInfo('Comment created successfully', { action: 'createComment', workoutId, parentId }, req)
		return res.status(200).json(new ApiResponse(200, comment[0], 'Comment created successfully'))
	}
)

export const getComments = asyncHandler(
	async (
		req: Request<{ id: string }, object, object, { isReply?: string; limit?: string; cursor?: string }>,
		res: Response
	) => {
		const id = req.params.id
		const isRepliesRoute = req.query.isReply === 'true'
		const limit = parseInt((req.query.limit as string) || (isRepliesRoute ? '10' : '20'), 10)
		const cursor = req.query.cursor as string

		const whereClause = isRepliesRoute ? { parentId: id } : { workoutId: id, parentId: null }
		const orderByClause = isRepliesRoute ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const }

		const items = await prisma.workoutComment.findMany({
			where: whereClause,
			take: limit + 1, // Fetch an extra item to check if there's a next page
			cursor: cursor ? { id: cursor } : undefined,
			orderBy: orderByClause,
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
					select: { replies: true },
				},
				replies: isRepliesRoute
					? {
							take: 3,
							orderBy: { createdAt: 'asc' },
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
									select: { replies: true },
								},
							},
						}
					: false,
			},
		})

		let nextCursor: string | null = null
		if (items.length > limit) {
			const nextItem = items.pop() // Remove the extra item
			nextCursor = nextItem!.id
		}

		// Dynamic select types from Prisma make strict typing difficult here
		const formattedItems = (items as any[]).map(item => {
			const isDeleted = !!item.deletedAt

			const formattedReplies =
				item.replies?.map((reply: any) => {
					const replyIsDeleted = !!reply.deletedAt
					return {
						...reply,
						content: replyIsDeleted ? '[This comment has been deleted]' : reply.content,
						user: replyIsDeleted ? null : reply.user,
					}
				}) || []

			return {
				...item,
				content: isDeleted ? '[This comment has been deleted]' : item.content,
				user: isDeleted ? null : item.user,
				replies: formattedReplies,
			}
		})

		logInfo(
			isRepliesRoute ? 'Replies fetched successfully' : 'Comments fetched successfully',
			{ action: 'getComments', id },
			req
		)

		const responseData = isRepliesRoute
			? { replies: formattedItems, nextCursor }
			: { comments: formattedItems, nextCursor }

		return res
			.status(200)
			.json(
				new ApiResponse(
					200,
					responseData,
					isRepliesRoute ? 'Replies fetched successfully' : 'Comments fetched successfully'
				)
			)
	}
)

export const editComment = asyncHandler(
	async (req: Request<{ id: string }, {}, { content: string }>, res: Response) => {
		const commentId = req.params.id
		const userId = req.user?.id
		const { content } = req.body

		const existingComment = await prisma.workoutComment.findUnique({
			where: { id: commentId },
		})

		if (!existingComment) {
			logWarn(
				`Comment with the comment id:${commentId} does not exist`,
				{ action: 'editComment', commentId },
				req
			)
			throw new ApiError(404, 'Comment does not exist')
		}

		if (existingComment.userId !== userId) {
			logWarn(
				`Comment with the comment id:${commentId} does not belong to the user with the user id:${userId}`,
				{ action: 'editComment', commentId, userId },
				req
			)
			throw new ApiError(403, 'This comment does not belong to you')
		}

		const comment = await prisma.workoutComment.update({
			where: { id: commentId },
			data: {
				content,
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
					select: { replies: true },
				},
			},
		})

		logInfo('Comment edited successfully', { action: 'editComment', commentId }, req)
		return res.status(200).json(new ApiResponse(200, comment, 'Comment edited successfully'))
	}
)

export const deleteComment = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const commentId = req.params.id
	const userId = req.user?.id

	const existingComment = await prisma.workoutComment.findUnique({
		where: { id: commentId },
	})

	if (!existingComment) {
		logWarn(`Comment with the comment id:${commentId} does not exist`, { action: 'deleteComment', commentId }, req)
		throw new ApiError(404, 'Comment does not exist')
	}

	if (existingComment.userId !== userId) {
		logWarn(
			`Comment with the comment id:${commentId} does not belong to the user with the user id:${userId}`,
			{ action: 'deleteComment', commentId, userId },
			req
		)
		throw new ApiError(403, 'Your unauthorized to delete this comment')
	}

	const comment = await prisma.$transaction([
		prisma.workoutComment.update({
			where: { id: commentId },
			data: {
				deletedAt: new Date(),
			},
		}),
	])

	logInfo('Comment deleted successfully', { action: 'deleteComment', commentId }, req)
	return res.status(200).json(new ApiResponse(200, comment[0], 'Comment deleted successfully'))
})

export const createCommentLike = asyncHandler(async (req: Request, res: Response) => {})

export const deleteCommentLike = asyncHandler(async (req: Request, res: Response) => {})

export const createPostLike = asyncHandler(async (req: Request, res: Response) => {})

export const deletePostLike = asyncHandler(async (req: Request, res: Response) => {})
