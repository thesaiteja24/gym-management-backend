import type { PublicUser } from '../user/types.js'

// MAIN

export interface EngagementUser {
  id: string
  firstName: string
  lastName: string
  profilePicUrl: string | null
}

export interface CommentResponse {
  id: string
  userId: string
  content: string
  parentId: string | null
  workoutId: string | null
  likesCount: number
  repliesCount: number
  createdAt: string | Date
  updatedAt: string | Date
  deletedAt: string | Date | null
  user: EngagementUser
  replies?: CommentResponse[]
}

export interface LikeResponse {
  id: string
  userId: string
  targetId: string
  targetType: 'workout' | 'comment'
  user: EngagementUser
}

// PAYLOAD

export interface CreateCommentBody {
  content: string
  parentId?: string
}

export interface EditCommentBody {
  content: string
}

export interface ToggleLikeQuery {
  type: 'workout' | 'comment'
  liked: string | boolean
}

export interface GetCommentsQuery {
  isReply?: string
  limit?: string
  cursor?: string
}

export interface GetLikesQuery {
  type: 'workout' | 'comment'
}

// RESPONSE

export interface CommentsListResponse {
  comments?: CommentResponse[]
  replies?: CommentResponse[]
  nextCursor: string | null
}
