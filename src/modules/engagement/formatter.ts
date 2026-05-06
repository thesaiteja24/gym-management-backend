import type {
  CommentResponse,
  EngagementUser,
  LikeResponse,
} from './types.js'

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
