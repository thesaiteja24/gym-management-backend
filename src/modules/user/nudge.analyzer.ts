import { prisma } from '../../lib/prisma.js'

import type { RelationshipType, UserWorkoutState } from './nudge.types.js'



export async function analyzeWorkoutState(userId: string): Promise<UserWorkoutState> {
  // Fetch last 10 workouts to understand frequency and recency
  const recentWorkouts = await prisma.workoutLog.findMany({
    where: {
      userId,
      deletedAt: null,
      startTime: { not: null },
    },
    orderBy: { startTime: 'desc' },
    take: 10,
    select: { startTime: true },
  })

  if (recentWorkouts.length === 0) {
    // Check if they ever had a workout
    const hasAnyWorkout = await prisma.workoutLog.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    })
    return hasAnyWorkout ? 'inactive' : 'new_user'
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0) // Normalize to start of day

  // Calculate days since last workout
  const lastWorkoutDate = recentWorkouts[0].startTime!
  const lastWorkoutDay = new Date(lastWorkoutDate)
  lastWorkoutDay.setHours(0, 0, 0, 0)
  
  const diffTime = Math.abs(now.getTime() - lastWorkoutDay.getTime())
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  // Calculate workout frequency in the last 14 days
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(now.getDate() - 14)
  
  const workoutsLast14Days = recentWorkouts.filter(
    w => w.startTime! >= fourteenDaysAgo
  ).length

  // State Logic
  // Returning users: recently worked out again after a long break.
  if (diffDays <= 2 && recentWorkouts.length > 1) {
    const secondLastWorkoutDate = recentWorkouts[1].startTime!
    const secondLastWorkoutDay = new Date(secondLastWorkoutDate)
    secondLastWorkoutDay.setHours(0, 0, 0, 0)

    const diffBetweenLastTwo = Math.floor(
      Math.abs(lastWorkoutDay.getTime() - secondLastWorkoutDay.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffBetweenLastTwo > 14) {
      return 'returning'
    }
  }

  if (diffDays <= 1) {
    if (workoutsLast14Days >= 6) {
      return 'highly_active' // Working out almost every other day or more
    }
    return 'consistent'
  }

  if (diffDays <= 6) {
    return 'cooling_off' // Hasn't worked out in a few days
  }

  // Fallback for users inactive for over a week
  return 'inactive'
}

export async function analyzeRelationship(senderId: string, receiverId: string): Promise<RelationshipType> {
  const [senderFollowsReceiver, receiverFollowsSender] = await Promise.all([
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: senderId,
          followingId: receiverId,
        },
      },
    }),
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: receiverId,
          followingId: senderId,
        },
      },
    }),
  ])

  if (senderFollowsReceiver && receiverFollowsSender) {
    return 'mutual'
  }
  if (senderFollowsReceiver) {
    return 'following' // Sender is following the receiver
  }
  if (receiverFollowsSender) {
    return 'follower' // Sender is a follower of the receiver
  }

  return 'none'
}
