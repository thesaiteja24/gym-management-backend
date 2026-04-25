import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { ApiError } from '../../utils/ApiError.js'
import type { PublicUser } from './types.js'

// CONSTANTS
const prisma = new PrismaClient().$extends(withAccelerate())

// QUERY HELPERS

/**
 * Base selection for public user data.
 * Does not include virtual fields like 'isFollowing'.
 */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
  followersCount: true,
  followingCount: true,
  isPro: true,
  proSubscriptionType: true,
}

/**
 * Returns a select object for public user data, optionally including follow status.
 * @param currentUserId The ID of the user performing the request
 */
export const getPublicUserSelect = (currentUserId?: string) => ({
  ...publicUserSelect,
  followers: currentUserId
    ? { where: { followerId: currentUserId }, select: { followerId: true } }
    : false,
})

// FUNCTIONS

/**
 * Fetch a public user profile by ID.
 * @param userId The ID of the user to fetch
 * @param currentUserId Optional ID of the user making the request (for follow status)
 * @returns Formatted public user data
 */
export async function getUserById(userId: string, currentUserId?: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: getPublicUserSelect(currentUserId),
  })

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return formatPublicUser(user, currentUserId)
}

// OTHER HELPERS

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
    isPro: user.isPro || false,
    proSubscriptionType: user.proSubscriptionType || null,
    isFollowing: currentUserId ? (user.followers?.length > 0) : undefined,
  }
}
