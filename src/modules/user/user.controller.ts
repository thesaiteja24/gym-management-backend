import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response } from 'express'

import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const selfUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
  followersCount: true,
  followingCount: true,
  isPro: true,
  proSubscriptionType: true,
  email: true,
  countryCode: true,
  phone: true,
  height: true,
  weight: true,
  preferredLengthUnit: true,
  preferredWeightUnit: true,
  dateOfBirth: true,
  gender: true,
  role: true,
  privacyPolicyAcceptedAt: true,
  privacyPolicyVersion: true,
  phoneE164: true,
  createdAt: true,
  updatedAt: true,
}

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

export function formatUserResponse(user: any) {
  if (!user) return null
  return {
    ...user,
    height: user.height?.toNumber?.() ?? user.height ?? null,
    weight: user.weight?.toNumber?.() ?? user.weight ?? null,
    dateOfBirth: user.dateOfBirth?.toISOString?.() ?? user.dateOfBirth ?? null,
  }
}

export const getUser = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId

  // PUBLIC branch
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  })

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return res.status(200).json(new ApiResponse(200, user, 'User fetched successfully'))
})
