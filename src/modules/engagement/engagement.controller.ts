import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logInfo, logWarn } from '../../common/utils/logger.js'
import { NotificationService } from '../../common/services/notification.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

/**
 * Standard user selection for engagement related queries
 * Includes an optional check if the current user is following the returned user
 */
const getUserSelect = (currentUserId?: string) => ({
	id: true,
	firstName: true,
	lastName: true,
	profilePicUrl: true,
	isPro: true,
	proSubscriptionType: true,
	followers: currentUserId
		? {
				where: { followerId: currentUserId },
				select: { followerId: true },
		  }
		: false,
})

/**
 * Maps a Prisma user object to the standard API response format
 */
const mapUserResponse = (user: any) => {
	if (!user) return null
	return {
		id: user.id,
		firstName: user.firstName || '',
		lastName: user.lastName || '',
		profilePicUrl: user.profilePicUrl || '',
		isFollowing: Array.isArray(user.followers) ? user.followers.length > 0 : false,
		isPro: user.isPro || false,
		proSubscriptionType: user.proSubscriptionType || '',
	}
}

/**
 * Formats a comment object for the API response, handling deleted states and recursive replies
 */
const formatCommentResponse = (comment: any): any => {
	const isDeleted = !!comment.deletedAt
	return {
		id: comment.id,
		userId: comment.userId,
		content: isDeleted ? '[This comment has been deleted]' : comment.content,
		parentId: comment.parentId || '',
		workoutId: comment.workoutId || '',
		likesCount: comment.likesCount,
		repliesCount: comment._count?.replies || 0,
		createdAt: comment.createdAt,
		updatedAt: comment.updatedAt,
		deletedAt: comment.deletedAt,
		user: {
			id: isDeleted ? '' : comment.user?.id || '',
			firstName: isDeleted ? 'Deleted' : comment.user?.firstName || '',
			lastName: isDeleted ? 'User' : comment.user?.lastName || '',
			profilePicUrl: isDeleted ? '' : comment.user?.profilePicUrl || '',
		},
		replies: comment.replies?.map((reply: any) => formatCommentResponse(reply)) || [],
	}
}

export const followUser = asyncHandler(async (req: Request<{ id: string }, {}, {}>, res: Response) => {
	const currentUserId = req.user?.id as string
	const targetUserId = req.params.id

	if (currentUserId === targetUserId) {
		throw new ApiError(400, 'You cannot follow yourself')
	}

	const [currentUser, targetUser] = await Promise.all([
		prisma.user.findUnique({
			where: { id: currentUserId },
			select: { firstName: true, lastName: true },
		}),
		prisma.user.findUnique({
			where: { id: targetUserId },
			select: getUserSelect(currentUserId),
		}),
	])

	if (!targetUser) throw new ApiError(404, 'User does not exist')

	const isAlreadyFollowing = (targetUser.followers?.length || 0) > 0
	if (isAlreadyFollowing) {
		return res.status(200).json(new ApiResponse(200, mapUserResponse(targetUser), 'Already following'))
	}

	await prisma.$transaction([
		prisma.follow.create({
			data: { followerId: currentUserId, followingId: targetUserId },
		}),
		prisma.user.update({
			where: { id: currentUserId },
			data: { followingCount: { increment: 1 } },
		}),
		prisma.user.update({
			where: { id: targetUserId },
			data: { followersCount: { increment: 1 } },
		}),
	])

	if (currentUser) {
		NotificationService.sendPushToUsers(
			[targetUserId],
			'New Follower!',
			`${currentUser.firstName} ${currentUser.lastName} started following you.`,
			{ type: 'new_follower', userId: currentUserId }
		).catch(err => logWarn('Failed to send follow notification', { err }, req))
	}

	logInfo('User followed successfully', { action: 'followUser', targetUserId }, req)
	return res.status(200).json(
		new ApiResponse(
			200,
			{ ...mapUserResponse(targetUser), isFollowing: true },
			"You're now following"
		)
	)
})

export const unFollowUser = asyncHandler(async (req: Request<{ id: string }, {}, {}>, res: Response) => {
	const currentUserId = req.user?.id as string
	const targetUserId = req.params.id

	if (currentUserId === targetUserId) {
		throw new ApiError(400, 'You cannot unfollow yourself')
	}

	const targetUser = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: getUserSelect(currentUserId),
	})

	if (!targetUser) throw new ApiError(404, 'User does not exist')

	const isFollowing = (targetUser.followers?.length || 0) > 0
	if (!isFollowing) {
		return res.status(200).json(new ApiResponse(200, mapUserResponse(targetUser), 'Not following this user'))
	}

	await prisma.$transaction([
		prisma.follow.delete({
			where: {
				followerId_followingId: { followerId: currentUserId, followingId: targetUserId },
			},
		}),
		prisma.user.update({
			where: { id: currentUserId },
			data: { followingCount: { decrement: 1 } },
		}),
		prisma.user.update({
			where: { id: targetUserId },
			data: { followersCount: { decrement: 1 } },
		}),
	])

	logInfo('User unfollowed successfully', { action: 'unFollowUser', targetUserId }, req)
	return res.status(200).json(
		new ApiResponse(
			200,
			{ ...mapUserResponse(targetUser), isFollowing: false },
			"You've unfollowed"
		)
	)
})

export const getUserFollowing = asyncHandler(async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
	const { userId } = req.params
	const currentUserId = req.user?.id

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true },
	})

	if (!user) throw new ApiError(404, 'User does not exist')

	const following = await prisma.follow.findMany({
		where: { followerId: userId },
		select: {
			following: {
				select: getUserSelect(currentUserId),
			},
		},
	})

	const result = following.map(item => mapUserResponse(item.following))

	logInfo('User following fetched successfully', { action: 'getUserFollowing', userId, count: result.length }, req)
	return res.status(200).json(new ApiResponse(200, result, 'User following fetched successfully'))
})

export const getUserFollowers = asyncHandler(async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
	const { userId } = req.params
	const currentUserId = req.user?.id

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true },
	})

	if (!user) throw new ApiError(404, 'User does not exist')

	const followers = await prisma.follow.findMany({
		where: { followingId: userId },
		select: {
			follower: {
				select: getUserSelect(currentUserId),
			},
		},
	})

	const result = followers.map(item => mapUserResponse(item.follower))

	logInfo('User followers fetched successfully', { action: 'getUserFollowers', userId, count: result.length }, req)
	return res.status(200).json(new ApiResponse(200, result, 'User followers fetched successfully'))
})

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
	const query = req.query.query as string
	const currentUserId = req.user?.id

	if (!query) throw new ApiError(400, 'No query provided')

	const results = await prisma.user.findMany({
		where: {
			OR: [
				{ firstName: { startsWith: query, mode: 'insensitive' } },
				{ lastName: { startsWith: query, mode: 'insensitive' } },
			],
		},
		take: 20,
		select: getUserSelect(currentUserId),
	})

	const formattedResults = results.map(user => mapUserResponse(user))

	logInfo('Users search successful', { action: 'searchUsers', query, count: formattedResults.length }, req)
	return res.status(200).json(new ApiResponse(200, formattedResults, 'Users fetched successfully'))
})

export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
	const currentUserId = req.user?.id

	const users = await prisma.user.findMany({
		where: { id: { not: currentUserId } },
		select: getUserSelect(currentUserId),
		take: 20,
	})

	const result = users.map(user => mapUserResponse(user))

	logInfo('Suggested users fetched', { action: 'getSuggestedUsers', count: result.length }, req)
	return res.status(200).json(new ApiResponse(200, result, 'Users fetched successfully'))
})

// Post related
export const createComment = asyncHandler(
	async (req: Request<{ id: string }, object, { content: string; parentId?: string }>, res: Response) => {
		const userId = req.user?.id
		const workoutId = req.params.id
		const { content, parentId } = req.body

		const [existingUser, workout] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
			prisma.workoutLog.findUnique({
				where: { id: workoutId },
				select: { userId: true },
			}),
		])

		if (!existingUser) throw new ApiError(404, 'User does not exist')
		if (!workout) throw new ApiError(404, 'Workout does not exist')

		let parentCommentUserId: string | null = null
		if (parentId) {
			const parentComment = await prisma.workoutComment.findUnique({
				where: { id: parentId },
				select: { userId: true, workoutId: true },
			})

			if (!parentComment) throw new ApiError(404, 'Parent comment does not exist')
			if (parentComment.workoutId !== workoutId) {
				throw new ApiError(403, 'This comment does not belong to this workout')
			}
			parentCommentUserId = parentComment.userId
		}

		const [comment] = await prisma.$transaction([
			prisma.workoutComment.create({
				data: { workoutId, userId: userId!, content, parentId: parentId ?? null },
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
					user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
					_count: { select: { replies: true } },
				},
			}),
			prisma.workoutLog.update({
				where: { id: workoutId },
				data: { commentsCount: { increment: 1 } },
			}),
		])

		if (parentId && parentCommentUserId && parentCommentUserId !== userId) {
			NotificationService.sendPushToUsers(
				[parentCommentUserId],
				'New Reply!',
				`${existingUser.firstName} ${existingUser.lastName} replied to your comment.`,
				{ type: 'comment_reply', workoutId, commentId: comment.id, parentId, userId }
			).catch(err => logWarn('Failed to send reply notification', { err }, req))
		} else if (!parentId && workout.userId !== userId) {
			NotificationService.sendPushToUsers(
				[workout.userId],
				'New Comment!',
				`${existingUser.firstName} ${existingUser.lastName} commented on your workout.`,
				{ type: 'workout_comment', workoutId, commentId: comment.id, userId }
			).catch(err => logWarn('Failed to send comment notification', { err }, req))
		}

		logInfo('Comment created', { action: 'createComment', commentId: comment.id }, req)
		return res.status(200).json(new ApiResponse(200, formatCommentResponse(comment), 'Comment created successfully'))
	}
)

export const getComments = asyncHandler(
	async (
		req: Request<{ id: string }, object, object, { isReply?: string; limit?: string; cursor?: string }>,
		res: Response
	) => {
		const { id } = req.params
		const isRepliesRoute = req.query.isReply === 'true'
		const limit = parseInt(req.query.limit || '10', 10)
		const cursor = req.query.cursor

		const where = isRepliesRoute ? { parentId: id } : { workoutId: id, parentId: null }
		const orderBy = isRepliesRoute ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const }

		const items = await prisma.workoutComment.findMany({
			where,
			take: limit + 1,
			cursor: cursor ? { id: cursor } : undefined,
			orderBy,
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
				user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
				_count: { select: { replies: true } },
			},
		})

		let nextCursor: string | null = null
		if (items.length > limit) {
			const nextItem = items.pop()
			nextCursor = nextItem!.id
		}

		const formattedItems = items.map(item => formatCommentResponse(item))

		logInfo('Comments fetched', { action: 'getComments', id, count: items.length }, req)
		return res.status(200).json(
			new ApiResponse(
				200,
				{ [isRepliesRoute ? 'replies' : 'comments']: formattedItems, nextCursor },
				'Comments fetched successfully'
			)
		)
	}
)

export const editComment = asyncHandler(
	async (req: Request<{ commentId: string }, {}, { content: string }>, res: Response) => {
		const { commentId } = req.params
		const userId = req.user?.id
		const { content } = req.body

		const comment = await prisma.workoutComment.update({
			where: { id: commentId, userId },
			data: { content },
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
				user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
				_count: { select: { replies: true } },
			},
		})

		if (!comment) throw new ApiError(404, 'Comment not found or unauthorized')

		logInfo('Comment edited', { action: 'editComment', commentId }, req)
		return res.status(200).json(new ApiResponse(200, formatCommentResponse(comment), 'Comment edited successfully'))
	}
)

export const deleteComment = asyncHandler(async (req: Request<{ commentId: string }>, res: Response) => {
	const { commentId } = req.params
	const userId = req.user?.id

	const comment = await prisma.workoutComment.update({
		where: { id: commentId, userId },
		data: { deletedAt: new Date() },
	})

	if (!comment) throw new ApiError(404, 'Comment not found or unauthorized')

	logInfo('Comment deleted', { action: 'deleteComment', commentId }, req)
	return res.status(200).json(new ApiResponse(200, comment, 'Comment deleted successfully'))
})

export const getLikes = asyncHandler(async (req: Request, res: Response) => {
	const { id } = req.params
	const type = req.query.type as 'workout' | 'comment'

	const config = {
		workout: { likeModel: prisma.workoutLike, parentModel: prisma.workoutLog, idKey: 'workoutId' },
		comment: { likeModel: prisma.workoutCommentLike, parentModel: prisma.workoutComment, idKey: 'commentId' },
	}[type]

	if (!config) throw new ApiError(400, 'Invalid like type')

	const parent = await (config.parentModel as any).findUnique({ where: { id }, select: { id: true } })
	if (!parent) throw new ApiError(404, `${type} not found`)

	const likes = await (config.likeModel as any).findMany({
		where: { [config.idKey]: id },
		select: {
			userId: true,
			user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
		},
	})

	const mappedLikes = likes.map((like: any) => ({
		id: `${like.userId}_${id}`,
		userId: like.userId,
		targetId: id,
		targetType: type,
		user: like.user,
	}))

	logInfo(`${type} likes fetched`, { action: 'getLikes', id, count: likes.length }, req)
	return res.status(200).json(new ApiResponse(200, mappedLikes, `${type} likes fetched successfully`))
})

export const toggleLikeAction = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const { id } = req.params
	const type = req.query.type as 'workout' | 'comment'
	const liked = req.query.liked
	const userId = req.user?.id as string

	const config = {
		workout: {
			likeModel: prisma.workoutLike,
			parentModel: prisma.workoutLog,
			idKey: 'workoutId',
			notification: { title: 'New Workout Like!', message: (n: string) => `${n} liked your workout.`, type: 'workout_like' },
		},
		comment: {
			likeModel: prisma.workoutCommentLike,
			parentModel: prisma.workoutComment,
			idKey: 'commentId',
			notification: { title: 'New Comment Like!', message: (n: string) => `${n} liked your comment.`, type: 'comment_like' },
		},
	}[type]

	if (!config) throw new ApiError(400, 'Invalid like type')

	const [parent, user] = await Promise.all([
		(config.parentModel as any).findUnique({ where: { id }, select: { userId: true, ...(type === 'comment' ? { workoutId: true } : {}) } }),
		prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
	])

	if (!parent) throw new ApiError(404, `${type} not found`)

	const existingLike = await (config.likeModel as any).findUnique({
		where: { [`userId_${config.idKey}`]: { [config.idKey]: id, userId } },
		include: { user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } } },
	})

	if (liked) {
		if (existingLike) {
			return res.status(200).json(new ApiResponse(200, { id: `${userId}_${id}`, userId, targetId: id, targetType: type, user: existingLike.user }, 'Already liked'))
		}

		const [newLike] = await prisma.$transaction([
			(config.likeModel as any).create({
				data: { [config.idKey]: id, userId },
				include: { user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } } },
			}),
			(config.parentModel as any).update({ where: { id }, data: { likesCount: { increment: 1 } } }),
		])

		if (user && parent.userId !== userId) {
			NotificationService.sendPushToUsers(
				[parent.userId],
				config.notification.title,
				config.notification.message(`${user.firstName} ${user.lastName}`),
				{ type: config.notification.type, workoutId: type === 'workout' ? id : parent.workoutId, commentId: type === 'comment' ? id : undefined, userId }
			).catch(err => logWarn('Failed to send notification', { err }, req))
		}

		logInfo(`${type} liked`, { action: 'toggleLike', id, userId }, req)
		return res.status(200).json(new ApiResponse(200, { id: `${userId}_${id}`, userId, targetId: id, targetType: type, user: newLike.user }, `${type} liked successfully`))
	} else {
		if (!existingLike) return res.status(200).json(new ApiResponse(200, null, 'Not liked yet'))

		await prisma.$transaction([
			(config.likeModel as any).delete({ where: { [`userId_${config.idKey}`]: { [config.idKey]: id, userId } } }),
			(config.parentModel as any).update({ where: { id }, data: { likesCount: { decrement: 1 } } }),
		])

		logInfo(`${type} unliked`, { action: 'toggleLike', id, userId }, req)
		return res.status(200).json(new ApiResponse(200, null, `${type} unliked successfully`))
	}
})
