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
export interface WorkoutActivity {
  [date: string]: {
    count: number
    volume: number
  }
}

export interface BestSet {
  weight: number | null
  reps: number | null
  durationSeconds: number | null
  setType: string
  createdAt: Date
}

export interface TopLift {
  exerciseId: string
  title: string
  thumbnailUrl: string | null
  bestSet: BestSet
  totalSets: number
}
