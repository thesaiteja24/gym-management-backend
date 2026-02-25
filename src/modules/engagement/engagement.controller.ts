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

	const existingFollow = await prisma.follow.findUnique({
		where: {
			followerId_followingId: {
				followerId: currentUserId,
				followingId: targetUserId,
			},
		},
	})

	if (existingFollow) {
		logDebug('Already following', { existingFollow }, req)
		return res.status(200).json(new ApiResponse(200, existingFollow, 'You are already following this user'))
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
	return res.status(200).json(new ApiResponse(200, result, "You're now following"))
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

	const existingFollow = await prisma.follow.findUnique({
		where: {
			followerId_followingId: {
				followerId: currentUserId,
				followingId: targetUserId,
			},
		},
	})

	if (!existingFollow) {
		logDebug('Not following', { currentUserId, targetUserId }, req)
		return res.status(200).json(new ApiResponse(200, null, 'You are not following this user'))
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
	return res.status(200).json(new ApiResponse(200, result, "You've unfollowed"))
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
			skip: cursor ? 1 : undefined,
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
				replies: !isRepliesRoute // Prefetch first 3 nested replies for top-level comments; omit when fetching replies directly
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
		throw new ApiError(403, "You're not authorized to delete this comment")
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

export const createCommentLike = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.user?.id
	const commentId = req.params.id

	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
	})

	if (!existingUser) {
		logWarn(`User with the user id:${userId} does not exist`, { action: 'createCommentLike', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const existingComment = await prisma.workoutComment.findUnique({
		where: { id: commentId },
	})

	if (!existingComment) {
		logWarn(
			`Comment with the comment id:${commentId} does not exist`,
			{ action: 'createCommentLike', commentId },
			req
		)
		throw new ApiError(404, 'Comment does not exist')
	}

	const liked = await prisma.workoutCommentLike.findUnique({
		where: {
			userId_commentId: {
				commentId,
				userId: userId!,
			},
		},
		select: {
			commentId: true,
			userId: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
		},
	})

	if (liked) {
		logWarn(
			`Comment with the comment id:${commentId} is already liked by the user with the user id:${userId}`,
			{ action: 'createCommentLike', commentId, userId },
			req
		)
		return res.status(200).json(new ApiResponse(200, liked, 'Comment is already liked'))
	}

	const commentLike = await prisma.$transaction([
		prisma.workoutCommentLike.create({
			data: {
				commentId,
				userId: userId!,
			},
			select: {
				commentId: true,
				userId: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePicUrl: true,
					},
				},
			},
		}),
		prisma.workoutComment.update({
			where: { id: commentId },
			data: {
				likesCount: { increment: 1 },
			},
		}),
	])

	logInfo('Comment like created successfully', { action: 'createCommentLike', commentId }, req)
	return res.status(200).json(new ApiResponse(200, commentLike[0], 'Comment like created successfully'))
})

export const getCommentLikes = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const commentId = req.params.id

	const existingComment = await prisma.workoutComment.findUnique({
		where: { id: commentId },
	})

	if (!existingComment) {
		logWarn(
			`Comment with the comment id:${commentId} does not exist`,
			{ action: 'getCommentLikes', commentId },
			req
		)
		throw new ApiError(404, 'Comment does not exist')
	}

	const commentLikes = await prisma.workoutCommentLike.findMany({
		where: { commentId },
		select: {
			commentId: true,
			userId: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
		},
	})

	logInfo('Comment likes fetched successfully', { action: 'getCommentLikes', commentId }, req)
	return res.status(200).json(new ApiResponse(200, commentLikes, 'Comment likes fetched successfully'))
})

export const deleteCommentLike = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.user?.id
	const commentId = req.params.id

	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
	})

	if (!existingUser) {
		logWarn(`User with the user id:${userId} does not exist`, { action: 'deleteCommentLike', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const existingComment = await prisma.workoutComment.findUnique({
		where: { id: commentId },
	})

	if (!existingComment) {
		logWarn(
			`Comment with the comment id:${commentId} does not exist`,
			{ action: 'deleteCommentLike', commentId },
			req
		)
		throw new ApiError(404, 'Comment does not exist')
	}

	const existingLike = await prisma.workoutCommentLike.findUnique({
		where: {
			userId_commentId: {
				commentId,
				userId: userId!,
			},
		},
		select: {
			commentId: true,
			userId: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
		},
	})

	if (!existingLike) {
		logDebug('Comment like does not exist', { action: 'deleteCommentLike', commentId, userId }, req)
		return res.status(200).json(new ApiResponse(200, null, 'Comment is not liked'))
	}

	// Transaction result not captured; existingLike holds the data to return
	await prisma.$transaction([
		prisma.workoutCommentLike.delete({
			where: {
				userId_commentId: {
					commentId,
					userId: userId!,
				},
			},
		}),
		prisma.workoutComment.update({
			where: { id: commentId },
			data: {
				likesCount: { decrement: 1 },
			},
		}),
	])

	logInfo('Comment like deleted successfully', { action: 'deleteCommentLike', commentId }, req)
	return res.status(200).json(new ApiResponse(200, existingLike, 'Comment like deleted successfully'))
})

export const getWorkoutLikes = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const workoutId = req.params.id

	const existingWorkout = await prisma.workoutLog.findUnique({
		where: { id: workoutId },
	})

	if (!existingWorkout) {
		logWarn(
			`Workout with the workout id:${workoutId} does not exist`,
			{ action: 'getWorkoutLikes', workoutId },
			req
		)
		throw new ApiError(404, 'Workout does not exist')
	}

	const workoutLikes = await prisma.workoutLike.findMany({
		where: { workoutId },
		select: {
			workoutId: true,
			userId: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
		},
	})

	logInfo('Workout likes fetched successfully', { action: 'getWorkoutLikes', workoutId }, req)
	return res.status(200).json(new ApiResponse(200, workoutLikes, 'Workout likes fetched successfully'))
})

export const createWorkoutLike = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.user?.id
	const workoutId = req.params.id

	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
	})

	if (!existingUser) {
		logWarn(`User with the user id:${userId} does not exist`, { action: 'createWorkoutLike', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const existingWorkout = await prisma.workoutLog.findUnique({
		where: { id: workoutId },
	})

	if (!existingWorkout) {
		logWarn(
			`Workout with the workout id:${workoutId} does not exist`,
			{ action: 'createWorkoutLike', workoutId },
			req
		)
		throw new ApiError(404, 'Workout does not exist')
	}

	const liked = await prisma.workoutLike.findUnique({
		where: {
			userId_workoutId: {
				workoutId,
				userId: userId!,
			},
		},
		select: {
			workoutId: true,
			userId: true,
			createdAt: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					profilePicUrl: true,
				},
			},
		},
	})

	if (liked) {
		logWarn(
			`Workout with the workout id:${workoutId} is already liked by the user with the user id:${userId}`,
			{ action: 'createWorkoutLike', workoutId, userId },
			req
		)
		return res.status(200).json(new ApiResponse(200, liked, 'Workout is already liked'))
	}

	const workoutLike = await prisma.$transaction([
		prisma.workoutLike.create({
			data: {
				workoutId,
				userId: userId!,
			},
			select: {
				workoutId: true,
				userId: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePicUrl: true,
					},
				},
			},
		}),
		prisma.workoutLog.update({
			where: { id: workoutId },
			data: {
				likesCount: { increment: 1 },
			},
		}),
	])

	logInfo('Workout like created successfully', { action: 'createWorkoutLike', workoutId }, req)
	return res.status(200).json(new ApiResponse(200, workoutLike[0], 'Workout like created successfully'))
})

export const deleteWorkoutLike = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.user?.id
	const workoutId = req.params.id

	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
	})

	if (!existingUser) {
		logWarn(`User with the user id:${userId} does not exist`, { action: 'deleteWorkoutLike', userId }, req)
		throw new ApiError(404, 'User does not exist')
	}

	const existingWorkout = await prisma.workoutLog.findUnique({
		where: { id: workoutId },
	})

	if (!existingWorkout) {
		logWarn(
			`Workout with the workout id:${workoutId} does not exist`,
			{ action: 'deleteWorkoutLike', workoutId },
			req
		)
		throw new ApiError(404, 'Workout does not exist')
	}

	const workoutLike = await prisma.$transaction([
		prisma.workoutLike.delete({
			where: {
				userId_workoutId: {
					workoutId,
					userId: userId!,
				},
			},
			select: {
				workoutId: true,
				userId: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePicUrl: true,
					},
				},
			},
		}),
		prisma.workoutLog.update({
			where: { id: workoutId },
			data: {
				likesCount: { decrement: 1 },
			},
		}),
	])

	logInfo('Workout like deleted successfully', { action: 'deleteWorkoutLike', workoutId }, req)
	return res.status(200).json(new ApiResponse(200, workoutLike[0], 'Workout like deleted successfully'))
})
