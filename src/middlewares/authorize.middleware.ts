import { prisma } from '../lib/prisma.js'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

import type { UserRole } from '../types/index.js'
import { ApiError } from '../utils/ApiError.js'



export const authorize = (...allowedRoles: UserRole[]): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new ApiError(401, 'Unauthorized'))
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true },
    })

    if (!user) {
      return next(new ApiError(404, 'User not found'))
    }

    if (!allowedRoles.includes(user.role)) {
      return next(new ApiError(403, 'Your role does not have permission to perform this action'))
    }

    // Update req.user.role to the latest from DB for downstream usage
    req.user.role = user.role

    next()
  }
}

export const authorizeSelfOrAdmin = (paramName: string = 'id'): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return next(new ApiError(401, 'Unauthorized'))

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true },
    })

    if (!user) {
      return next(new ApiError(404, 'User not found'))
    }

    if (user.role === 'systemAdmin' || req.user.id === req.params[paramName]) {
      req.user.role = user.role
      return next()
    }

    return next(new ApiError(403, 'You do not have permission to perform this action'))
  }
}
