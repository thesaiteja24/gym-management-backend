import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { NotificationService } from '../../common/services/notification.service.js'
import { ApiError } from '../../common/utils/ApiError.js'

const prisma = new PrismaClient().$extends(withAccelerate())

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

export const mapUserResponse = (user: any) => {
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

export const formatCommentResponse = (comment: any): any => {
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

export async function processFollow(currentUserId: string, targetUserId: string, _req: any) {
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

export async function processComment(
  userId: string,
  workoutId: string,
  content: string,
  parentId?: string,
  _req?: any,
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

export async function processToggleLike(
  id: string,
  type: 'workout' | 'comment',
  liked: boolean,
  userId: string,
  _req?: any,
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
      where: { id },
      select: { userId: true, ...(isWorkout ? {} : { workoutId: true }) },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
  ])
  if (!parent) throw new ApiError(404, `${type} not found`)

  const existing = await (models.like as any).findUnique({
    where: { [`userId_${models.idKey}`]: { [models.idKey]: id, userId } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
    },
  })

  if (liked) {
    if (existing) return { alreadyLiked: true, like: existing }
    const [newLike] = await prisma.$transaction([
      (models.like as any).create({
        data: { [models.idKey]: id, userId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profilePicUrl: true } },
        },
      }),
      (models.parent as any).update({ where: { id }, data: { likesCount: { increment: 1 } } }),
    ])
    if (user && parent.userId !== userId) {
      NotificationService.sendPushToUsers(
        [parent.userId],
        models.title,
        models.msg(`${user.firstName} ${user.lastName}`),
        {
          type: models.type,
          workoutId: isWorkout ? id : parent.workoutId,
          commentId: isWorkout ? undefined : id,
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
        where: { [`userId_${models.idKey}`]: { [models.idKey]: id, userId } },
      }),
      (models.parent as any).update({ where: { id }, data: { likesCount: { decrement: 1 } } }),
    ])
    return { notLiked: false }
  }
}
