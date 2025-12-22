import { ApiError } from '../utils/ApiError.js'
import { logWarn } from '../utils/logger.js'

export const authorize = (...allowedRoles) => {
	return (req, res, next) => {
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

export const authorizeSelfOrAdmin = () => {
	return (req, res, next) => {
		if (!req.user) return next(new ApiError(401, 'Unauthorized'))

		if (req.user.role === 'systemAdmin' || req.user.id === req.params.userId) {
			return next()
		}

		return next(new ApiError(403, 'Forbidden'))
	}
}
