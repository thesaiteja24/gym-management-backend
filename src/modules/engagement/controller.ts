import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as engagementService from './service.js'
import type { GetCommentsQuery, GetLikesQuery, ToggleLikeQuery } from './types.js'

// FUNCTIONS

/**
 * Follow a user.
 */
export const followUser = asyncHandler(async (req: Request, res: Response) => {
  const followerId = req.user!.id
  const followingId = req.params.userId as string
  const user = await engagementService.followUser(followerId, followingId)
  return res
    .status(200)
    .json(new ApiResponse(200, { user, status: 'following' }, 'Followed user successfully'))
})

/**
 * Unfollow a user.
 */
export const unFollowUser = asyncHandler(async (req: Request, res: Response) => {
  const followerId = req.user!.id
  const followingId = req.params.userId as string
  const user = await engagementService.unFollowUser(followerId, followingId)
  return res
    .status(200)
    .json(new ApiResponse(200, { user, status: 'not_following' }, 'Unfollowed user successfully'))
})

/**
 * Fetch followers of a user.
 */
export const getUserFollowers = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId as string
  const currentUserId = req.user!.id
  const followers = await engagementService.getUserFollowers(userId, currentUserId)
  return res.status(200).json(new ApiResponse(200, followers, 'Followers fetched successfully'))
})

/**
 * Fetch users followed by a user.
 */
export const getUserFollowing = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId as string
  const currentUserId = req.user!.id
  const following = await engagementService.getUserFollowing(userId, currentUserId)
  return res.status(200).json(new ApiResponse(200, following, 'Following fetched successfully'))
})

/**
 * Search users by name or email.
 */
export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.query as string
  const currentUserId = req.user!.id
  const users = await engagementService.searchUsers(query, currentUserId)
  return res.status(200).json(new ApiResponse(200, users, 'Users searched successfully'))
})

/**
 * Get suggested users.
 */
export const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.user!.id
  const users = await engagementService.getSuggestedUsers(currentUserId)
  return res.status(200).json(new ApiResponse(200, users, 'Suggestions fetched successfully'))
})

/**
 * Toggle like status for a workout or comment.
 */
export const toggleLikeAction = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const targetId = req.params.id as string
  const { type, liked } = req.query as unknown as ToggleLikeQuery
  const isLiked = liked === true || liked === 'true'

  const result = await engagementService.toggleLike(userId, targetId, type, isLiked)
  const message = isLiked ? 'Liked successfully' : 'Unliked successfully'
  return res.status(200).json(new ApiResponse(200, result, message))
})

/**
 * Fetch likes for a target.
 */
export const getLikes = asyncHandler(async (req: Request, res: Response) => {
  const targetId = req.params.id as string
  const { type } = req.query as unknown as GetLikesQuery
  const likes = await engagementService.getLikes(targetId, type)
  return res.status(200).json(new ApiResponse(200, likes, 'Likes fetched successfully'))
})

/**
 * Create a new comment.
 */
export const createComment = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const workoutId = req.params.id as string
  const { content, parentId } = req.body
  const comment = await engagementService.createComment(userId, workoutId, content, parentId)
  return res.status(201).json(new ApiResponse(201, comment, 'Comment created successfully'))
})

/**
 * Edit an existing comment.
 */
export const editComment = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const commentId = req.params.commentId as string
  const { content } = req.body
  const comment = await engagementService.editComment(userId, commentId, content)
  return res.status(200).json(new ApiResponse(200, comment, 'Comment updated successfully'))
})

/**
 * Delete a comment.
 */
export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const commentId = req.params.commentId as string
  await engagementService.deleteComment(userId, commentId)
  return res.status(200).json(new ApiResponse(200, null, 'Comment deleted successfully'))
})

/**
 * Fetch comments for a workout or replies for a comment.
 */
export const getComments = asyncHandler(async (req: Request, res: Response) => {
  const targetId = req.params.id as string
  const { isReply, limit, cursor } = req.query as unknown as GetCommentsQuery
  const isReplyBool = isReply === 'true'
  const limitNum = parseInt(limit || '10')

  const result = await engagementService.getComments(
    targetId,
    isReplyBool,
    limitNum,
    cursor as string | undefined,
  )
  return res.status(200).json(new ApiResponse(200, result, 'Comments fetched successfully'))
})
