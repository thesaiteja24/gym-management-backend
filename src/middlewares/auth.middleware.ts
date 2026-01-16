import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError.js'
import { logDebug, logError } from '../utils/logger.js'
import { verifyAccessToken } from '../utils/tokens.js'

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const authHeader = req.headers.authorization
	if (!authHeader || !authHeader.startsWith('Bearer')) {
		return next(new ApiError(401, 'Missing authorization header'))
	}

	const token = authHeader.split(' ')[1]

	try {
		const payload = verifyAccessToken(token)
		logDebug('Token verified', { action: 'verifyAccessToken', payload }, req)
		req.user = { id: payload.id, phoneE164: payload.phoneE164, role: payload.role }
		logDebug('User attached to request', { action: 'attachUser', user: req.user }, req)
		next()
	} catch (error) {
		logError('Failed verifyAccessToken: Invalid access token', error as Error, { action: 'verifyAccessToken' }, req)
		return next(new ApiError(401, 'Invalid access token'))
	}
}
