import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'

import * as engagementService from './engagement.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const followUser = asyncHandler(
  async (req: Request<{ id: string }, object, object>, res: Response) => {
    const currentUserId = req.user?.id as string
    const targetUserId = req.params.id

    if (currentUserId === targetUserId) throw new ApiError(400, 'You cannot follow yourself')

    const { alreadyFollowing, targetUser } = await engagementService.processFollow(
      currentUserId,
      targetUserId,
      req,
    )

    const status = alreadyFollowing ? 'Already following' : "You're now following"
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { ...engagementService.mapUserResponse(targetUser), isFollowing: true },
          status,
        ),
      )
  },
)

export const unFollowUser = asyncHandler(
  async (req: Request<{ id: string }, object, object>, res: Response) => {
    const currentUserId = req.user?.id as string
    const targetUserId = req.params.id

    if (currentUserId === targetUserId) throw new ApiError(400, 'You cannot unfollow yourself')

    const { notFollowing, targetUser } = await engagementService.processUnfollow(
      currentUserId,
      targetUserId,
    )

    const status = notFollowing ? 'Not following this user' : "You've unfollowed"
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { ...engagementService.mapUserResponse(targetUser), isFollowing: false },
          status,
        ),
      )
  },
)

export const getUserFollowing = asyncHandler(
  async (req: Request<{ userId: string }, object, object>, res: Response) => {
    const { userId } = req.params
    const currentUserId = req.user?.id

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { following: { select: engagementService.getUserSelect(currentUserId) } },
    })

    const result = following.map((item) => engagementService.mapUserResponse(item.following))
    return res.status(200).json(new ApiResponse(200, result, 'User following fetched'))
  },
)

export const getUserFollowers = asyncHandler(
  async (req: Request<{ userId: string }, object, object>, res: Response) => {
    const { userId } = req.params
    const currentUserId = req.user?.id

    const followers = await prisma.follow.findMany({
      where: { followingId: userId },
      select: { follower: { select: engagementService.getUserSelect(currentUserId) } },
    })

    const result = followers.map((item) => engagementService.mapUserResponse(item.follower))
    return res.status(200).json(new ApiResponse(200, result, 'User followers fetched'))
  },
)

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
    select: engagementService.getUserSelect(currentUserId),
  })

  const formattedResults = results.map((user) => engagementService.mapUserResponse(user))
  return res.status(200).json(new ApiResponse(200, formattedResults, 'Users fetched successfully'))
})

export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.user?.id
  const users = await prisma.user.findMany({
    where: { id: { not: currentUserId } },
    select: engagementService.getUserSelect(currentUserId),
    take: 20,
  })

  const result = users.map((user) => engagementService.mapUserResponse(user))
  return res.status(200).json(new ApiResponse(200, result, 'Users fetched successfully'))
})

export const createComment = asyncHandler(
  async (
    req: Request<{ id: string }, object, { content: string; parentId?: string }>,
    res: Response,
  ) => {
    const userId = req.user?.id as string
    const workoutId = req.params.id
    const { content, parentId } = req.body

    const comment = await engagementService.processComment(
      userId,
      workoutId,
      content,
      parentId,
      req,
    )
    return res
      .status(200)
      .json(
        new ApiResponse(200, engagementService.formatCommentResponse(comment), 'Comment created'),
      )
  },
)

export const getComments = asyncHandler(
  async (
    req: Request<
      { id: string },
      object,
      object,
      { isReply?: string; limit?: string; cursor?: string }
    >,
    res: Response,
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

    const formattedItems = items.map((item) => engagementService.formatCommentResponse(item))
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { [isRepliesRoute ? 'replies' : 'comments']: formattedItems, nextCursor },
          'Comments fetched',
        ),
      )
  },
)

export const editComment = asyncHandler(
  async (req: Request<{ commentId: string }, object, { content: string }>, res: Response) => {
    const { commentId } = req.params
    const userId = req.user?.id
    const { content } = req.body

    const comment = await prisma.workoutComment.update({
      where: { id: commentId, userId },
      data: { content },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
        _count: { select: { replies: true } },
      },
    })
    if (!comment) throw new ApiError(404, 'Comment not found')

    return res
      .status(200)
      .json(
        new ApiResponse(200, engagementService.formatCommentResponse(comment), 'Comment edited'),
      )
  },
)

export const deleteComment = asyncHandler(
  async (req: Request<{ commentId: string }>, res: Response) => {
    const { commentId } = req.params
    const userId = req.user?.id

    const comment = await prisma.workoutComment.update({
      where: { id: commentId, userId },
      data: { deletedAt: new Date() },
    })
    if (!comment) throw new ApiError(404, 'Comment not found')

    return res.status(200).json(new ApiResponse(200, comment, 'Comment deleted'))
  },
)

export const getLikes = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const type = req.query.type as 'workout' | 'comment'
  const isWorkout = type === 'workout'
  const models = isWorkout
    ? { like: prisma.workoutLike, parent: prisma.workoutLog, idKey: 'workoutId' }
    : { like: prisma.workoutCommentLike, parent: prisma.workoutComment, idKey: 'commentId' }

  const parent = await (models.parent as any).findUnique({ where: { id }, select: { id: true } })
  if (!parent) throw new ApiError(404, `${type} not found`)

  const likes = await (models.like as any).findMany({
    where: { [models.idKey]: id },
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
  return res.status(200).json(new ApiResponse(200, mappedLikes, `${type} likes fetched`))
})

export const toggleLikeAction = asyncHandler(
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params
    const type = req.query.type as 'workout' | 'comment'
    const liked = req.query.liked === 'true'
    const userId = req.user?.id as string

    const { alreadyLiked, notLiked, like } = await engagementService.processToggleLike(
      id,
      type,
      liked,
      userId,
      req,
    )

    if (liked && alreadyLiked)
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { id: `${userId}_${id}`, userId, targetId: id, targetType: type, user: like.user },
            'Already liked',
          ),
        )
    if (!liked && notLiked) return res.status(200).json(new ApiResponse(200, null, 'Not liked yet'))

    const resData = liked
      ? { id: `${userId}_${id}`, userId, targetId: id, targetType: type, user: like.user }
      : null
    return res
      .status(200)
      .json(new ApiResponse(200, resData, `${type} ${liked ? 'liked' : 'unliked'} successfully`))
  },
)
