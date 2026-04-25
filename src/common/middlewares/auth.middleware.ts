import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import type { Request, Response, NextFunction } from 'express'

import { ApiError } from '../utils/ApiError.js'
import { verifyAccessToken } from '../utils/tokens.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return next(new ApiError(401, 'Missing authorization header'))
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = verifyAccessToken(token)
    
    // Verify user exists and get current role from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, phoneE164: true, role: true },
    })

    if (!user) {
      return next(new ApiError(401, 'User not found'))
    }

    req.user = {
      id: user.id,
      phoneE164: user.phoneE164,
      email: user.email,
      role: user.role,
    }

    next()
  } catch (_error) {
    return next(new ApiError(401, 'Invalid access token'))
  }
}
