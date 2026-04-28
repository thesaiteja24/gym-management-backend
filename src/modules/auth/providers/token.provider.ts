import type { SignOptions } from 'jsonwebtoken'
import jwt from 'jsonwebtoken'
import type { StringValue } from 'ms'

import { setRefreshToken } from '../../../service/caching.service.js'
import { ApiError } from '../../../utils/ApiError.js'
import type { TokenPayload, UserForToken } from '../types.js'

// CONSTANTS
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET!
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY! as StringValue
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET!
const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY! as StringValue

// FUNCTIONS

/**
 * Issues a new refresh token for a user and stores it in the cache.
 * @param user User data for token payload
 * @returns Signed refresh token
 */
export const issueRefreshToken = async (user: UserForToken): Promise<string> => {
  if (!user?.id || !user?.role) {
    throw new ApiError(400, 'Invalid user data', [])
  }

  if (!user.phoneE164 && !user.email) {
    throw new ApiError(400, 'User must have phone or email', [])
  }

  const payload: TokenPayload = {
    id: user.id,
    phoneE164: user.phoneE164 || null,
    email: user.email || null,
    role: user.role as TokenPayload['role'],
  }
  const options: SignOptions = { expiresIn: refreshTokenExpiry }

  try {
    const refreshToken = jwt.sign(payload, refreshTokenSecret, options)
    await setRefreshToken(user.id, refreshToken, refreshTokenExpiry, true)
    return refreshToken
  } catch (error) {
    const err = error as Error
    throw new ApiError(500, 'Authentication failed', [err.message])
  }
}

/**
 * Issues a new access token for a user.
 * @param user User data for token payload
 * @returns Signed access token
 */
export const issueAccessToken = async (user: UserForToken): Promise<string> => {
  if (!user?.id || !user?.role) {
    throw new ApiError(400, 'Invalid user data', [])
  }

  if (!user.phoneE164 && !user.email) {
    throw new ApiError(400, 'User must have phone or email', [])
  }

  const payload: TokenPayload = {
    id: user.id,
    phoneE164: user.phoneE164 || null,
    email: user.email || null,
    role: user.role as TokenPayload['role'],
  }
  const options: SignOptions = { expiresIn: accessTokenExpiry }

  try {
    const accessToken = jwt.sign(payload, accessTokenSecret, options)
    return accessToken
  } catch (error) {
    const err = error as Error
    throw new ApiError(500, 'Token generation failed', [err.message])
  }
}

/**
 * Verifies an access token and returns its payload.
 * @param token JWT access token
 * @returns Decoded token payload
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  if (!token) throw new ApiError(401, 'No token provided', [])
  try {
    return jwt.verify(token, accessTokenSecret) as TokenPayload
  } catch (error) {
    const err = error as Error
    throw new ApiError(401, 'Invalid token', [err.message])
  }
}

/**
 * Verifies a refresh token and returns its payload.
 * @param token JWT refresh token
 * @returns Decoded token payload
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  if (!token) throw new ApiError(401, 'No refresh token', [])
  try {
    return jwt.verify(token, refreshTokenSecret) as TokenPayload
  } catch (error) {
    const err = error as Error
    throw new ApiError(401, 'Invalid refresh token', [err.message])
  }
}
