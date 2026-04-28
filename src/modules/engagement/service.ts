import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { NotificationService } from '../../service/notification.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { formatPublicUser, getPublicUserSelect } from '../user/service.js'
import type { PublicUser } from '../user/types.js'

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
 * Lean selection for engagement users (comments/likes).
 */
export const engagementUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
}

/**
 * Returns a Prisma select object for user data with follower status.
 * @param currentUserId The ID of the user performing the request
 */
export const getEngagementUserSelect = (currentUserId?: string) =>
  getPublicUserSelect(currentUserId)

//  HELPERS

/**
 * Formats a Prisma user result into a lean EngagementUser.
 */
export function formatLeanUser(user: any): EngagementUser {
  if (!user) return null as any
  return {
    id: user.id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    profilePicUrl: user.profilePicUrl || null,
  }
}

/**
 * Formats a Prisma comment result into a CommentResponse.
 */
export function formatComment(comment: any): CommentResponse {
  return {
    id: comment.id,
    userId: comment.userId,
    content: comment.content,
    parentId: comment.parentId,
    workoutId: comment.workoutId,
    likesCount: comment.likesCount || 0,
    repliesCount: comment._count?.replies || 0,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    deletedAt: comment.deletedAt ? comment.deletedAt.toISOString() : null,
    user: formatLeanUser(comment.user),
  }
}

/**
 * Formats a Prisma like result into a LikeResponse.
 */
export function formatLike(
  like: any,
  targetId: string,
  targetType: 'workout' | 'comment',
): LikeResponse {
  return {
    id: `${like.userId}_${targetId}`,
    userId: like.userId,
    targetId,
    targetType,
    user: formatLeanUser(like.user),
  }
}

// FUNCTIONS

/**
 * Follow a user.
 */
export async function followUser(followerId: string, followingId: string): Promise<PublicUser> {
  if (followerId === followingId) throw new ApiError(400, 'You cannot follow yourself')

  const follower = await prisma.user.findUnique({
    where: { id: followerId },
    select: { firstName: true, lastName: true },
  })
  if (!follower) throw new ApiError(404, 'Follower not found')

  const targetUser = await prisma.user.findUnique({
    where: { id: followingId },
    select: { id: true },
  })
  if (!targetUser) throw new ApiError(404, 'User not found')

  const existingFollow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  })
  if (existingFollow) throw new ApiError(400, 'Already following this user')

  const [follow] = await prisma.$transaction([
    prisma.follow.create({
      data: { followerId, followingId },
      include: {
        following: { select: getEngagementUserSelect(followerId) },
      },
    }),
    prisma.user.update({
      where: { id: followerId },
      data: { followingCount: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: followingId },
      data: { followersCount: { increment: 1 } },
    }),
  ])

  // Send notification
  const followerName = `${follower.firstName} ${follower.lastName}`.trim()
  await NotificationService.sendPushToUsers(
    [followingId],
    'New Follower',
    `${followerName} started following you`,
    { type: 'follow', followerId },
  ).catch(() => {})

  return formatPublicUser(follow.following, followerId)
}

/**
 * Unfollow a user.
 */
export async function unFollowUser(followerId: string, followingId: string): Promise<PublicUser> {
  const existingFollow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    include: {
      following: { select: getEngagementUserSelect(followerId) },
    },
  })
  if (!existingFollow) throw new ApiError(400, 'Not following this user')

  await prisma.$transaction([
    prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    }),
    prisma.user.update({
      where: { id: followerId },
      data: { followingCount: { decrement: 1 } },
    }),
    prisma.user.update({
      where: { id: followingId },
      data: { followersCount: { decrement: 1 } },
    }),
  ])

  return formatPublicUser(existingFollow.following, followerId)
}

/**
 * Fetch followers of a user.
 */
export async function getUserFollowers(
  userId: string,
  currentUserId: string,
): Promise<PublicUser[]> {
  const followers = await prisma.follow.findMany({
    where: { followingId: userId },
    include: {
      follower: { select: getEngagementUserSelect(currentUserId) },
    },
  })
  return followers.map((f: any) => formatPublicUser(f.follower, currentUserId))
}

/**
 * Fetch users followed by a user.
 */
export async function getUserFollowing(
  userId: string,
  currentUserId: string,
): Promise<PublicUser[]> {
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      following: { select: getEngagementUserSelect(currentUserId) },
    },
  })
  return following.map((f: any) => formatPublicUser(f.following, currentUserId))
}

/**
 * Search users by name or email.
 */
export async function searchUsers(query: string, currentUserId: string): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
      id: { not: currentUserId },
    },
    select: getEngagementUserSelect(currentUserId),
    take: 20,
  })
  return users.map((u: any) => formatPublicUser(u, currentUserId))
}

/**
 * Get suggested users (users not followed by current user).
 */
export async function getSuggestedUsers(currentUserId: string): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
    },
    select: getEngagementUserSelect(currentUserId),
    take: 20,
  })
  return users.map((u: any) => formatPublicUser(u, currentUserId))
}

/**
 * Toggle like status for a workout or comment.
 */
export async function toggleLike(
  userId: string,
  targetId: string,
  targetType: 'workout' | 'comment',
  liked: boolean,
): Promise<LikeResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  })
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Someone'

  if (targetType === 'workout') {
    const existingLike = await prisma.workoutLike.findUnique({
      where: { userId_workoutId: { userId, workoutId: targetId } },
    })

    if (liked && !existingLike) {
      const [like] = await prisma.$transaction([
        prisma.workoutLike.create({
          data: { userId, workoutId: targetId },
          include: { user: { select: engagementUserSelect } },
        }),
        prisma.workoutLog.update({
          where: { id: targetId },
          data: { likesCount: { increment: 1 } },
        }),
      ])

      // Send notification
      const workout = await prisma.workoutLog.findUnique({
        where: { id: targetId },
        select: { userId: true },
      })
      if (workout && workout.userId !== userId) {
        await NotificationService.sendPushToUsers(
          [workout.userId],
          'New Like',
          `${userName} liked your workout`,
          { type: 'workout_like', workoutId: targetId },
        ).catch(() => {})
      }

      return formatLike(like, targetId, 'workout')
    } else if (!liked && existingLike) {
      await prisma.$transaction([
        prisma.workoutLike.delete({
          where: { userId_workoutId: { userId, workoutId: targetId } },
        }),
        prisma.workoutLog.update({
          where: { id: targetId },
          data: { likesCount: { decrement: 1 } },
        }),
      ])
      return {
        id: `${userId}_${targetId}`,
        userId,
        targetId,
        targetType: 'workout',
        user: null as any,
      }
    }
  } else {
    const existingLike = await prisma.workoutCommentLike.findUnique({
      where: { userId_commentId: { userId, commentId: targetId } },
    })

    if (liked && !existingLike) {
      const [like] = await prisma.$transaction([
        prisma.workoutCommentLike.create({
          data: { userId, commentId: targetId },
          include: { user: { select: engagementUserSelect } },
        }),
        prisma.workoutComment.update({
          where: { id: targetId },
          data: { likesCount: { increment: 1 } },
        }),
      ])
      return formatLike(like, targetId, 'comment')
    } else if (!liked && existingLike) {
      await prisma.$transaction([
        prisma.workoutCommentLike.delete({
          where: { userId_commentId: { userId, commentId: targetId } },
        }),
        prisma.workoutComment.update({
          where: { id: targetId },
          data: { likesCount: { decrement: 1 } },
        }),
      ])
      return {
        id: `${userId}_${targetId}`,
        userId,
        targetId,
        targetType: 'comment',
        user: null as any,
      }
    }
  }

  throw new ApiError(400, 'Invalid like status toggle')
}

/**
 * Fetch likes for a target.
 */
export async function getLikes(
  targetId: string,
  targetType: 'workout' | 'comment',
): Promise<LikeResponse[]> {
  if (targetType === 'workout') {
    const likes = await prisma.workoutLike.findMany({
      where: { workoutId: targetId },
      include: { user: { select: engagementUserSelect } },
    })
    return likes.map((l: any) => formatLike(l, targetId, 'workout'))
  } else {
    const likes = await prisma.workoutCommentLike.findMany({
      where: { commentId: targetId },
      include: { user: { select: engagementUserSelect } },
    })
    return likes.map((l: any) => formatLike(l, targetId, 'comment'))
  }
}

/**
 * Create a new comment.
 */
export async function createComment(
  userId: string,
  workoutId: string,
  content: string,
  parentId?: string,
): Promise<CommentResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  })
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Someone'

  const [comment] = await prisma.$transaction([
    prisma.workoutComment.create({
      data: { userId, workoutId, content, parentId },
      include: {
        user: { select: engagementUserSelect },
        _count: { select: { replies: true } },
      },
    }),
    parentId
      ? prisma.workoutComment.update({
          where: { id: parentId },
          data: { updatedAt: new Date() },
        })
      : prisma.workoutLog.update({
          where: { id: workoutId },
          data: { commentsCount: { increment: 1 } },
        }),
  ])

  // Send notification
  const workout = await prisma.workoutLog.findUnique({
    where: { id: workoutId },
    select: { userId: true },
  })
  if (workout && workout.userId !== userId) {
    await NotificationService.sendPushToUsers(
      [workout.userId],
      'New Comment',
      `${userName} commented on your workout`,
      { type: 'comment', workoutId },
    ).catch(() => {})
  }

  return formatComment(comment)
}

/**
 * Edit an existing comment.
 */
export async function editComment(
  userId: string,
  commentId: string,
  content: string,
): Promise<CommentResponse> {
  const comment = await prisma.workoutComment.findUnique({
    where: { id: commentId },
  })
  if (!comment) throw new ApiError(404, 'Comment not found')
  if (comment.userId !== userId) throw new ApiError(403, 'Unauthorized to edit this comment')

  const updatedComment = await prisma.workoutComment.update({
    where: { id: commentId },
    data: { content },
    include: {
      user: { select: engagementUserSelect },
      _count: { select: { replies: true } },
    },
  })

  return formatComment(updatedComment)
}

/**
 * Delete a comment.
 */
export async function deleteComment(userId: string, commentId: string): Promise<void> {
  const comment = await prisma.workoutComment.findUnique({
    where: { id: commentId },
  })
  if (!comment) throw new ApiError(404, 'Comment not found')
  if (comment.userId !== userId) throw new ApiError(403, 'Unauthorized to delete this comment')

  await prisma.$transaction([
    prisma.workoutComment.delete({ where: { id: commentId } }),
    comment.parentId
      ? prisma.workoutComment.update({
          where: { id: comment.parentId },
          data: { updatedAt: new Date() },
        })
      : prisma.workoutLog.update({
          where: { id: comment.workoutId },
          data: { commentsCount: { decrement: 1 } },
        }),
  ])
}

/**
 * Fetch comments for a workout or replies for a comment.
 */
export async function getComments(
  targetId: string,
  isReply: boolean,
  limit: number,
  cursor?: string,
): Promise<CommentsListResponse> {
  const comments = await prisma.workoutComment.findMany({
    where: isReply ? { parentId: targetId } : { workoutId: targetId, parentId: null },
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: engagementUserSelect },
      _count: { select: { replies: true } },
    },
  })

  let nextCursor: string | null = null
  if (comments.length > limit) {
    const nextItem = comments.pop()
    nextCursor = nextItem!.id
  }

  const formattedComments = comments.map((c: any) => formatComment(c))

  return isReply
    ? { replies: formattedComments, nextCursor }
    : { comments: formattedComments, nextCursor }
}
