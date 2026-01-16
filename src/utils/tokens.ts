import jwt, { SignOptions } from 'jsonwebtoken'
import { StringValue } from 'ms'
import { setRefreshToken } from '../services/caching.service.js'
import { ApiError } from './ApiError.js'
import { logInfo, logError } from './logger.js'
import { TokenPayload } from '../types/index.js'

const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET!
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY! as StringValue
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET!
const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY! as StringValue

interface UserForToken {
	id: string
	phoneE164: string | null
	role: string
}

export const issueRefreshToken = async (user: UserForToken): Promise<string> => {
	// Input Validation
	if (!user?.id || !user?.phoneE164 || !user?.role) {
		throw new ApiError(400, 'Invalid user data', [])
	}

	// Business Logic
	const payload: TokenPayload = { id: user.id, phoneE164: user.phoneE164, role: user.role as TokenPayload['role'] }
	const options: SignOptions = { expiresIn: refreshTokenExpiry }
	let refreshToken: string
	try {
		refreshToken = jwt.sign(payload, refreshTokenSecret, options)
		await setRefreshToken(user.id, refreshToken, refreshTokenExpiry, true)
		logInfo('Refresh token stored', { action: 'storeRefreshToken', user: user.id }, null)
		return refreshToken
	} catch (error) {
		const err = error as Error
		logError(
			`Failed issueRefreshToken: Token or Redis error`,
			err,
			{ action: 'issueRefreshToken', user: user.id },
			null
		)
		throw new ApiError(500, 'Authentication failed', [err.message])
	}
}

export const issueAccessToken = async (user: UserForToken): Promise<string> => {
	// Input Validation
	if (!user?.id || !user?.phoneE164 || !user?.role) {
		throw new ApiError(400, 'Invalid user data', [])
	}

	// Business Logic
	const payload: TokenPayload = { id: user.id, phoneE164: user.phoneE164, role: user.role as TokenPayload['role'] }
	const options: SignOptions = { expiresIn: accessTokenExpiry }
	try {
		const accessToken = jwt.sign(payload, accessTokenSecret, options)
		logInfo('Access token issued', { action: 'issueAccessToken', user: user.id }, null)
		return accessToken
	} catch (error) {
		const err = error as Error
		logError(`Failed issueAccessToken: Token error`, err, { action: 'issueAccessToken', user: user.id }, null)
		throw new ApiError(500, 'Token generation failed', [err.message])
	}
}

export const verifyAccessToken = (token: string): TokenPayload => {
	if (!token) throw new ApiError(401, 'No token provided', [])
	try {
		return jwt.verify(token, accessTokenSecret) as TokenPayload
	} catch (error) {
		const err = error as Error
		throw new ApiError(401, 'Invalid token', [err.message])
	}
}

export const verifyRefreshToken = (token: string): TokenPayload => {
	if (!token) throw new ApiError(401, 'No refresh token', [])
	try {
		return jwt.verify(token, refreshTokenSecret) as TokenPayload
	} catch (error) {
		const err = error as Error
		throw new ApiError(401, 'Invalid refresh token', [err.message])
	}
}
