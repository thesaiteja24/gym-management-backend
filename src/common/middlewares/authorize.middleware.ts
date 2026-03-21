import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ApiError } from '../utils/ApiError.js'
import { logWarn } from '../utils/logger.js'
import { UserRole } from '../types/index.js'

export const authorize = (...allowedRoles: UserRole[]): RequestHandler => {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!req.user) {
			return next(new ApiError(401, 'Unauthorized'))
		}

		if (!allowedRoles.includes(req.user.role)) {
			logWarn(
				'Authorization failed',
				{
					action: 'authorize',
					userId: req.user.id,
					role: req.user.role,
					allowedRoles,
				},
				req
			)

			return next(new ApiError(403, 'Your role does not have permission to perform this action'))
		}

		next()
	}
}

export const authorizeSelfOrAdmin = (paramName: string = 'id'): RequestHandler => {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!req.user) return next(new ApiError(401, 'Unauthorized'))

		if (req.user.role === 'systemAdmin' || req.user.id === req.params[paramName]) {
			return next()
		}

		logWarn(
			'Authorization failed',
			{
				action: 'authorizeSelfOrAdmin',
				userId: req.user.id,
				role: req.user.role,
				paramName,
				paramValue: req.params[paramName],
			},
			req
		)
		return next(new ApiError(403, 'You do not have permission to perform this action'))
	}
}
