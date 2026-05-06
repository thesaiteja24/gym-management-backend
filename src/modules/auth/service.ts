import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { getRefreshToken } from '../../service/caching.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { formatSelfUser, selfUserSelect } from '../me/service.js'

import { verifyGoogleToken } from './providers/google.provider.js'
import {
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from './providers/token.provider.js'
import type { AuthResponse } from './types.js'

// CONSTANTS
const prisma = new PrismaClient().$extends(withAccelerate())

// QUERY HELPERS
/**
 * Internal select for Auth logic that includes fields needed for
 * account linking and subscription checks, but aren't necessarily in the public profile.
 */
const authUserSelect = {
  ...selfUserSelect,
  googleId: true,
  proExpirationDate: true,
  proSubscriptionId: true,
}

// FUNCTIONS

/**
 * Process token refresh by verifying the provided token and issuing new ones.
 * @param providedToken The refresh token provided by the client
 * @returns Object containing the user data and new access/refresh tokens
 */
export async function processRefreshToken(providedToken: string): Promise<AuthResponse> {
  let decoded: any
  try {
    decoded = verifyRefreshToken(providedToken)
  } catch (_error) {
    throw new ApiError(401, 'Invalid or expired refresh token')
  }

  const storedToken = await getRefreshToken(decoded.id)
  if (!providedToken || providedToken !== storedToken) {
    throw new ApiError(401, 'Session expired')
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: authUserSelect,
  })
  if (!user) throw new ApiError(401, 'User not found')

  const accessToken = await issueAccessToken(user)
  const refreshToken = await issueRefreshToken(user)

  return {
    user: formatSelfUser(user),
    accessToken,
    refreshToken,
  }
}

/**
 * Process Google OAuth login, creating or updating the user as needed.
 * @param idToken Google ID token from the client
 * @param privacyAccepted Whether the user accepted the privacy policy
 * @param privacyPolicyVersion Version of the privacy policy accepted
 * @returns Object containing the user data and new access/refresh tokens
 */
export async function processGoogleLogin(
  idToken: string,
  privacyAccepted?: boolean,
  privacyPolicyVersion?: string,
): Promise<AuthResponse> {
  const payload = await verifyGoogleToken(idToken)

  const { sub: googleId, email, given_name, family_name, picture } = payload
  if (!email) throw new ApiError(400, 'Invalid Google account')

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
    select: authUserSelect,
  })

  if (user) {
    const updateData: any = {}
    if (!user.googleId) updateData.googleId = googleId
    if (privacyAccepted) {
      updateData.privacyPolicyAcceptedAt = new Date()
      updateData.privacyPolicyVersion = privacyPolicyVersion
    }
    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: authUserSelect,
      })
    }
  } else {
    user = await prisma.user.create({
      data: {
        email,
        googleId,
        firstName: given_name,
        lastName: family_name,
        profilePicUrl: picture,
        role: 'member',
        ...(privacyAccepted && { privacyPolicyAcceptedAt: new Date(), privacyPolicyVersion }),
      },
      select: authUserSelect,
    })
  }

  if (!user) throw new ApiError(500, 'Google login failed')

  const accessToken = await issueAccessToken(user)
  const refreshToken = await issueRefreshToken(user)

  return {
    user: formatSelfUser(user),
    accessToken,
    refreshToken,
  }
}
