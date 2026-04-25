import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { ApiError } from '../../utils/ApiError.js'
import type { PublicUser } from './types.js'

// CONSTANTS
const prisma = new PrismaClient().$extends(withAccelerate())

// QUERY HELPERS

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

// FUNCTIONS

/**
 * Fetch a public user profile by ID.
 * @param userId The ID of the user to fetch
 * @returns Formatted public user data
 */
export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  })

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return formatPublicUser(user)
}

// OTHER HELPERS

/**
 * Formats a raw Prisma user object into a PublicUser response.
 * @param user Raw user data from Prisma
 * @returns Formatted PublicUser object
 */
export function formatPublicUser(user: any): PublicUser {
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
  }
}
