import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { OAuth2Client } from 'google-auth-library'

import { getRefreshToken } from '../../common/services/caching.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import {
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from '../../common/utils/tokens.js'
import { selfUserSelect } from '../user/user.controller.js'

const prisma = new PrismaClient().$extends(withAccelerate())

const googleClientId = process.env.GOOGLE_WEB_CLIENT_ID
const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID
const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID
const googleClient = new OAuth2Client(googleClientId)

export async function processRefreshToken(providedToken: string) {
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
    select: selfUserSelect,
  })
  if (!user) throw new ApiError(401, 'User not found')

  const accessToken = await issueAccessToken(user)
  const refreshToken = await issueRefreshToken(user)
  return { user, accessToken, refreshToken }
}

export async function processGoogleLogin(
  idToken: string,
  privacyAccepted?: boolean,
  privacyPolicyVersion?: string,
) {
  let payload: any
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: [googleClientId, googleAndroidClientId, googleIosClientId].filter(
        Boolean,
      ) as string[],
    })
    payload = ticket.getPayload()
  } catch (_error) {
    throw new ApiError(401, 'Invalid Google Token')
  }

  if (!payload) throw new ApiError(401, 'Invalid Google payload')
  const { sub: googleId, email, given_name, family_name, picture } = payload
  if (!email) throw new ApiError(400, 'Invalid Google account')

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
    select: selfUserSelect,
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
        select: selfUserSelect,
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
      select: selfUserSelect,
    })
  }

  if (!user) throw new ApiError(500, 'Google login failed')

  const accessToken = await issueAccessToken(user)
  const refreshToken = await issueRefreshToken(user)
  return { user, accessToken, refreshToken }
}
