import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { NotificationService } from '../../service/notification.service.js'
import { ApiError } from '../../utils/ApiError.js'
import type {
  CommentResponse,
  CommentsListResponse,
  EngagementUser,
  LikeResponse,
} from './types.js'

// CONSTANTS

const prisma = new PrismaClient().$extends(withAccelerate())

// QUERY HELPERS

/**
 * Returns a Prisma select object for user data with follower status.
 * @param currentUserId The ID of the user performing the request
 */
export const getUserSelect = (currentUserId?: string) => ({
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
  isPro: true,
  proSubscriptionType: true,
  followers: currentUserId
    ? { where: { followerId: currentUserId }, select: { followerId: true } }
    : false,
})

// FUNCTIONS

/**
 * Follow a user and send a notification.
 * @param currentUserId The user who is following
 * @param targetUserId The user being followed
 * @returns Object containing follow status and target user data
 */
export async function processFollow(currentUserId: string, targetUserId: string) {
  const [currentUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUserId },
      select: { firstName: true, lastName: true },
    }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: getUserSelect(currentUserId) }),
  ])

  if (!targetUser) throw new ApiError(404, 'User does not exist')
  if ((targetUser.followers?.length || 0) > 0) return { alreadyFollowing: true, targetUser }

  await prisma.$transaction([
    prisma.follow.create({ data: { followerId: currentUserId, followingId: targetUserId } }),
    prisma.user.update({
      where: { id: currentUserId },
      data: { followingCount: { increment: 1 } },
    }),
    prisma.user.update({ where: { id: targetUserId }, data: { followersCount: { increment: 1 } } }),
  ])

  if (currentUser) {
    NotificationService.sendPushToUsers(
      [targetUserId],
      'New Follower!',
      `${currentUser.firstName} ${currentUser.lastName} started following you.`,
      { type: 'new_follower', userId: currentUserId },
    ).catch(() => {
      // Silent notification failure
    })
  }
  return { alreadyFollowing: false, targetUser }
}

/**
 * Unfollow a user.
 * @param currentUserId The user who is unfollowing
 * @param targetUserId The user being unfollowed
 * @returns Object containing unfollow status and target user data
 */
export async function processUnfollow(currentUserId: string, targetUserId: string) {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: getUserSelect(currentUserId),
  })
  if (!targetUser) throw new ApiError(404, 'User does not exist')
  if ((targetUser.followers?.length || 0) === 0) return { notFollowing: true, targetUser }

  await prisma.$transaction([
    prisma.follow.delete({
      where: { followerId_followingId: { followerId: currentUserId, followingId: targetUserId } },
    }),
    prisma.user.update({
      where: { id: currentUserId },
      data: { followingCount: { decrement: 1 } },
    }),
    prisma.user.update({ where: { id: targetUserId }, data: { followersCount: { decrement: 1 } } }),
  ])
  return { notFollowing: false, targetUser }
}

/**
 * Fetch a user's followers.
 * @param userId The user whose followers to fetch
 * @param currentUserId The user performing the request
 */
export async function getFollowers(userId: string, currentUserId?: string): Promise<EngagementUser[]> {
  const followers = await prisma.follow.findMany({
    where: { followingId: userId },
    select: { follower: { select: getUserSelect(currentUserId) } },
  })

  return followers.map((item) => mapUserResponse(item.follower)!)
}

/**
 * Fetch users that a specific user follows.
 * @param userId The user whose following list to fetch
 * @param currentUserId The user performing the request
 */
export async function getFollowing(userId: string, currentUserId?: string): Promise<EngagementUser[]> {
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { following: { select: getUserSelect(currentUserId) } },
  })

  return following.map((item) => mapUserResponse(item.following)!)
}

/**
 * Search for users by name.
 * @param query Search query string
 * @param currentUserId The user performing the search
 */
export async function searchUsers(query: string, currentUserId?: string): Promise<EngagementUser[]> {
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

  return results.map((user) => mapUserResponse(user)!)
}

/**
 * Get suggested users for the current user.
 * @param currentUserId The user requesting suggestions
 */
export async function getSuggestedUsers(currentUserId?: string): Promise<EngagementUser[]> {
  const users = await prisma.user.findMany({
    where: { id: { not: currentUserId } },
    select: getUserSelect(currentUserId),
    take: 20,
  })

  return users.map((user) => mapUserResponse(user)!)
}

/**
 * Create a comment on a workout.
 * @param userId The user creating the comment
 * @param workoutId The workout being commented on
 * @param content The comment content
 * @param parentId Optional parent comment ID for replies
 */
export async function processComment(
  userId: string,
  workoutId: string,
  content: string,
  parentId?: string,
) {
  const [user, workout] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    prisma.workoutLog.findUnique({ where: { id: workoutId }, select: { userId: true } }),
  ])
  if (!user || !workout) throw new ApiError(404, 'User or Workout not found')

  let parentCommentUserId: string | null = null
  if (parentId) {
    const parent = await prisma.workoutComment.findUnique({
      where: { id: parentId },
      select: { userId: true, workoutId: true },
    })
    if (!parent || parent.workoutId !== workoutId) throw new ApiError(400, 'Invalid parent comment')
    parentCommentUserId = parent.userId
  }

  const [comment] = await prisma.$transaction([
    prisma.workoutComment.create({
      data: { workoutId, userId, content, parentId: parentId ?? null },
      include: {
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
      `${user.firstName} ${user.lastName} replied to your comment.`,
      { type: 'comment_reply', workoutId, commentId: comment.id, parentId, userId },
    ).catch(() => {
      // Silent notification failure
    })
  } else if (!parentId && workout.userId !== userId) {
    NotificationService.sendPushToUsers(
      [workout.userId],
      'New Comment!',
      `${user.firstName} ${user.lastName} commented on your workout.`,
      { type: 'workout_comment', workoutId, commentId: comment.id, userId },
    ).catch(() => {
      // Silent notification failure
    })
  }
  return comment
}

/**
 * Fetch comments for a workout or replies for a comment.
 * @param targetId Workout ID or Parent Comment ID
 * @param isRepliesRoute Whether we are fetching replies
 * @param limit Pagination limit
 * @param cursor Pagination cursor
 */
export async function getComments(
  targetId: string,
  isRepliesRoute: boolean,
  limit: number,
  cursor?: string,
): Promise<CommentsListResponse> {
  const where = isRepliesRoute ? { parentId: targetId } : { workoutId: targetId, parentId: null }
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

  const formattedItems = items.map((item) => formatCommentResponse(item))
  return {
    [isRepliesRoute ? 'replies' : 'comments']: formattedItems,
    nextCursor,
  }
}

/**
 * Fetch likes for a workout or a comment.
 * @param targetId Workout ID or Comment ID
 * @param type Target type
 */
export async function getLikes(targetId: string, type: 'workout' | 'comment'): Promise<LikeResponse[]> {
  const isWorkout = type === 'workout'
  const models = isWorkout
    ? { like: prisma.workoutLike, parent: prisma.workoutLog, idKey: 'workoutId' }
    : { like: prisma.workoutCommentLike, parent: prisma.workoutComment, idKey: 'commentId' }

  const parent = await (models.parent as any).findUnique({ where: { id: targetId }, select: { id: true } })
  if (!parent) throw new ApiError(404, `${type} not found`)

  const likes = await (models.like as any).findMany({
    where: { [models.idKey]: targetId },
    select: {
      userId: true,
      user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
    },
  })

  return likes.map((like: any) => ({
    id: `${like.userId}_${targetId}`,
    userId: like.userId,
    targetId,
    targetType: type,
    user: like.user,
  }))
}

/**
 * Toggle a like on a workout or comment.
 * @param targetId Target ID
 * @param type Target type
 * @param liked Whether the user wants to like or unlike
 * @param userId The user performing the action
 */
export async function processToggleLike(
  targetId: string,
  type: 'workout' | 'comment',
  liked: boolean,
  userId: string,
) {
  const isWorkout = type === 'workout'
  const models = isWorkout
    ? {
        like: prisma.workoutLike,
        parent: prisma.workoutLog,
        idKey: 'workoutId',
        title: 'New Workout Like!',
        msg: (n: string) => `${n} liked your workout.`,
        type: 'workout_like',
      }
    : {
        like: prisma.workoutCommentLike,
        parent: prisma.workoutComment,
        idKey: 'commentId',
        title: 'New Comment Like!',
        msg: (n: string) => `${n} liked your comment.`,
        type: 'comment_like',
      }

  const [parent, user] = await Promise.all([
    (models.parent as any).findUnique({
      where: { id: targetId },
      select: { userId: true, ...(isWorkout ? {} : { workoutId: true }) },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
  ])
  if (!parent) throw new ApiError(404, `${type} not found`)

  const existing = await (models.like as any).findUnique({
    where: { [`userId_${models.idKey}`]: { [models.idKey]: targetId, userId } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
    },
  })

  if (liked) {
    if (existing) return { alreadyLiked: true, like: existing }
    const [newLike] = await prisma.$transaction([
      (models.like as any).create({
        data: { [models.idKey]: targetId, userId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
        },
      }),
      (models.parent as any).update({ where: { id: targetId }, data: { likesCount: { increment: 1 } } }),
    ])
    if (user && parent.userId !== userId) {
      NotificationService.sendPushToUsers(
        [parent.userId],
        models.title,
        models.msg(`${user.firstName} ${user.lastName}`),
        {
          type: models.type,
          workoutId: isWorkout ? targetId : parent.workoutId,
          commentId: isWorkout ? undefined : targetId,
          userId,
        },
      ).catch(() => {
        // Silent notification failure
      })
    }
    return { alreadyLiked: false, like: newLike }
  } else {
    if (!existing) return { notLiked: true }
    await prisma.$transaction([
      (models.like as any).delete({
        where: { [`userId_${models.idKey}`]: { [models.idKey]: targetId, userId } },
      }),
      (models.parent as any).update({ where: { id: targetId }, data: { likesCount: { decrement: 1 } } }),
    ])
    return { notLiked: false }
  }
}

// OTHER HELPERS

/**
 * Maps a raw user object to the standardized EngagementUser response.
 * @param user Raw user object from Prisma
 */
export const mapUserResponse = (user: any): EngagementUser | null => {
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
 * Formats a raw comment object into the standardized CommentResponse.
 * @param comment Raw comment object from Prisma
 */
export const formatCommentResponse = (comment: any): CommentResponse => {
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
