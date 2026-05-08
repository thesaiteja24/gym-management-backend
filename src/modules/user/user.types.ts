// MAIN

export interface PublicUser {
  id: string
  firstName: string
  lastName: string
  profilePicUrl: string | null
  followersCount: number
  followingCount: number
  workoutsCount: number
  isPro: boolean
  proSubscriptionType: string | null
  isFollowing?: boolean
}

// PAYLOAD

// RESPONSE
