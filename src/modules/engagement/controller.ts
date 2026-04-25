import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { ApiError } from '../../utils/ApiError.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as engagementService from './service.js'
import type {
  CreateCommentBody,
  EditCommentBody,
  GetCommentsQuery,
  GetLikesQuery,
  ToggleLikeQuery,
} from './types.js'

// CONSTANTS

const prisma = new PrismaClient().$extends(withAccelerate())

// FUNCTIONS

export const followUser = asyncHandler(
  async (req: Request<{ id: string }, object, object>, res: Response) => {
    const currentUserId = req.user?.id as string
    const targetUserId = req.params.id

    if (currentUserId === targetUserId) throw new ApiError(400, 'You cannot follow yourself')

    const { alreadyFollowing, targetUser } = await engagementService.processFollow(
      currentUserId,
      targetUserId,
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

    const result = await engagementService.getFollowing(userId, currentUserId)
    return res.status(200).json(new ApiResponse(200, result, 'User following fetched'))
  },
)

export const getUserFollowers = asyncHandler(
  async (req: Request<{ userId: string }, object, object>, res: Response) => {
    const { userId } = req.params
    const currentUserId = req.user?.id

    const result = await engagementService.getFollowers(userId, currentUserId)
    return res.status(200).json(new ApiResponse(200, result, 'User followers fetched'))
  },
)

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.query as string
  const currentUserId = req.user?.id

  if (!query) throw new ApiError(400, 'No query provided')

  const formattedResults = await engagementService.searchUsers(query, currentUserId)
  return res.status(200).json(new ApiResponse(200, formattedResults, 'Users fetched successfully'))
})

export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.user?.id
  const result = await engagementService.getSuggestedUsers(currentUserId)
  return res.status(200).json(new ApiResponse(200, result, 'Users fetched successfully'))
})

export const createComment = asyncHandler(
  async (req: Request<{ id: string }, object, CreateCommentBody>, res: Response) => {
    const userId = req.user?.id as string
    const workoutId = req.params.id
    const { content, parentId } = req.body

    const comment = await engagementService.processComment(userId, workoutId, content, parentId)
    return res
      .status(200)
      .json(
        new ApiResponse(200, engagementService.formatCommentResponse(comment), 'Comment created'),
      )
  },
)

export const getComments = asyncHandler(
  async (req: Request<{ id: string }, object, object, any>, res: Response) => {
    const { id } = req.params
    const query = req.query as unknown as GetCommentsQuery
    const isRepliesRoute = query.isReply === 'true'
    const limit = parseInt(query.limit || '10', 10)
    const cursor = query.cursor

    const result = await engagementService.getComments(id, isRepliesRoute, limit, cursor)
    return res.status(200).json(new ApiResponse(200, result, 'Comments fetched'))
  },
)

export const editComment = asyncHandler(
  async (req: Request<{ commentId: string }, object, EditCommentBody>, res: Response) => {
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

export const getLikes = asyncHandler(
  async (req: Request<{ id: string }, object, object, any>, res: Response) => {
    const { id } = req.params
    const query = req.query as unknown as GetLikesQuery
    const type = query.type

    const mappedLikes = await engagementService.getLikes(id, type)
    return res.status(200).json(new ApiResponse(200, mappedLikes, `${type} likes fetched`))
  },
)

export const toggleLikeAction = asyncHandler(
  async (req: Request<{ id: string }, object, object, any>, res: Response) => {
    const { id } = req.params
    const query = req.query as unknown as any
    const type = query.type as ToggleLikeQuery['type']
    const liked = query.liked === true // transformed by zod
    const userId = req.user?.id as string

    const { alreadyLiked, notLiked, like } = await engagementService.processToggleLike(
      id,
      type,
      liked,
      userId,
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
