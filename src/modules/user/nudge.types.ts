export type UserWorkoutState =
  | 'highly_active'
  | 'consistent'
  | 'cooling_off'
  | 'inactive'
  | 'returning'
  | 'new_user'

export type RelationshipType =
  | 'mutual'
  | 'follower'
  | 'following'
  | 'none'

export type NudgeIntent =
  | 'encourage'
  | 'comeback'
  | 'celebrate'
  | 'challenge'
  | 'support'

export type BuildNudgeNotificationParams = {
  senderName: string
  state: UserWorkoutState
  relationship: RelationshipType
  intent?: NudgeIntent
  personalNote?: string | null
}

export type NudgeNotification = {
  title: string
  content: string
}
