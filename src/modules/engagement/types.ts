// MAIN

export interface EngagementUser {
  id: string
  firstName: string
  lastName: string
  profilePicUrl: string
  isFollowing: boolean
  isPro: boolean
  proSubscriptionType: string
}

export interface CommentResponse {
  id: string
  userId: string
  content: string
  parentId: string
  workoutId: string
  likesCount: number
  repliesCount: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  user: {
    id: string
    firstName: string
    lastName: string
    profilePicUrl: string
  }
  replies: CommentResponse[]
}

export interface LikeResponse {
  id: string
  userId: string
  targetId: string
  targetType: 'workout' | 'comment'
  user: {
    id: string
    firstName: string
    lastName: string
    profilePicUrl: string
  }
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
  liked: string // 'true' or 'false'
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

export interface FollowResponse {
  user: EngagementUser
  status: string
}

export interface CommentsListResponse {
  comments?: CommentResponse[]
  replies?: CommentResponse[]
  nextCursor: string | null
}
