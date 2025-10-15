import jwt from 'jsonwebtoken'
import { setRefreshToken } from '../services/caching.service.js'
import { ApiError } from './ApiError.js'
import { logInfo, logError } from './logger.js'

const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET
const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY

export const issueRefreshToken = async user => {
	// Input Validation
	if (!user?.id || !user?.phoneE164 || !user?.role) {
		throw new ApiError(400, 'Invalid user data', [])
	}

	// Business Logic
	const payload = { id: user.id, phoneE164: user.phoneE164, role: user.role }
	let refreshToken
	try {
		refreshToken = jwt.sign(payload, refreshTokenSecret, { expiresIn: refreshTokenExpiry })
		await setRefreshToken(user.id, refreshToken, refreshTokenExpiry, true)
		logInfo('Refresh token stored', { action: 'storeRefreshToken', user: user.id }, null)
		return refreshToken
	} catch (error) {
		logError(
			`Failed issueRefreshToken: Token or Redis error`,
			error,
			{ action: 'issueRefreshToken', user: user.id },
			null
		)
		throw new ApiError(500, 'Authentication failed', [error.message])
	}
}

export const issueAccessToken = async user => {
	// Input Validation
	if (!user?.id || !user?.phoneE164 || !user?.role) {
		throw new ApiError(400, 'Invalid user data', [])
	}

	// Business Logic
	const payload = { id: user.id, phoneE164: user.phoneE164, role: user.role }
	try {
		const accessToken = jwt.sign(payload, accessTokenSecret, { expiresIn: accessTokenExpiry })
		logInfo('Access token issued', { action: 'issueAccessToken', user: user.id }, null)
		return accessToken
	} catch (error) {
		logError(`Failed issueAccessToken: Token error`, error, { action: 'issueAccessToken', user: user.id }, null)
		throw new ApiError(500, 'Token generation failed', [error.message])
	}
}

export const verifyAccessToken = token => {
	if (!token) throw new ApiError(401, 'No token provided', [])
	try {
		return jwt.verify(token, accessTokenSecret)
	} catch (error) {
		throw new ApiError(401, 'Invalid token', [error.message])
	}
}

export const verifyRefreshToken = token => {
	if (!token) throw new ApiError(401, 'No refresh token', [])
	try {
		return jwt.verify(token, refreshTokenSecret)
	} catch (error) {
		throw new ApiError(401, 'Invalid refresh token', [error.message])
	}
}
