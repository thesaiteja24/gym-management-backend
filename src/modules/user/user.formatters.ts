import { PublicUser } from "./user.types.js"

/**
 * Formats a raw Prisma user object into a PublicUser response.
 * @param user Raw user data from Prisma
 * @param currentUserId Optional ID of the user making the request to determine follow status
 * @returns Formatted PublicUser object
 */
export function formatPublicUser(user: any, currentUserId?: string): PublicUser {
  if (!user) return null as any
  return {
    id: user.id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    profilePicUrl: user.profilePicUrl || null,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    workoutsCount: user._count?.workoutLogs || 0,
    isPro: user.isPro || false,
    proSubscriptionType: user.proSubscriptionType || null,
    isFollowing: currentUserId ? user.followers?.length > 0 : undefined,
  }
}