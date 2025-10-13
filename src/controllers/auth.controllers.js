import { createMessage } from '../services/messaging.service.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import crypto from 'crypto'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import { setOTP, resendOTP, getOTP, deleteOTP, setRefreshToken } from '../services/caching.service.js'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../generated/prisma/client.js'
import { withAccelerate } from '@prisma/extension-accelerate'
import jwt from 'jsonwebtoken'

const OTP_TTL = process.env.OTP_TTL
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS)
const prisma = new PrismaClient().$extends(withAccelerate())

const generateOTP = (length = 6) => {
	if (length < 6) throw new Error('Length must be equal to or greater than 6')
	const max = 10 ** length
	const n = crypto.randomInt(0, max)
	return n.toString().padStart(length, '0')
}

export const issueJWT = async user => {
	// Input validation
	if (!user?.id || !user?.phone_e164 || !user?.role) {
		throw new ApiError(400, 'Invalid user data', [])
	}

	// Business logic
	const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY
	const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY
	const payload = { id: user?.id, phone_e164: user?.phone_e164, role: user?.role }

	// External Interactions
	let accessToken, refreshToken
	try {
		accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: accessTokenExpiry })
		refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: refreshTokenExpiry })
		// store the refresh token in redis with user id as key
		await setRefreshToken(user.id, refreshToken, refreshTokenExpiry, true)
		logInfo('Refresh token stored', { action: 'setRefreshToken', user: user.id }, null)
	} catch (error) {
		logError(`Failed issueJWT: Token or Redis error`, error, { action: 'issueJWT', user: user.id }, null)
		throw new ApiError(500, 'Authentication failed', [error.message])
	}

	// Response
	return { accessToken, refreshToken }
}

export const verifyAccessToken = token => {
	if (!token) throw new ApiError(401, 'No token provided', [], true)
	try {
		return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
	} catch (error) {
		throw new ApiError(401, 'Invalid token', [error.message], true)
	}
}

export const verifyRefreshToken = token => {
	if (!token) throw new ApiError(401, 'No refresh token', [], true)
	try {
		return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET)
	} catch (error) {
		throw new ApiError(401, 'Invalid refresh token', [error.message], true)
	}
}

export const sendOTP = asyncHandler(async (req, res) => {
	// Input validation
	const { countryCode, phone, resend = false } = req.body
	if (!countryCode || !phone) {
		throw new ApiResponse(400, null, 'Country code and phone number are required')
	}
	const phoneE164 = countryCode.startsWith('+') ? `${countryCode}${phone}` : `+${countryCode}${phone}`
	const maskedPhone = phoneE164.replace(/(\d+)\d{4}$/, '$1XXXX')

	// Business logic
	const otp = generateOTP(6)
	const message = `Your otp for verification is ${otp}. It is valid for ${OTP_TTL}`
	let hashedOtp
	try {
		hashedOtp = await bcrypt.hash(otp, SALT_ROUNDS)
	} catch (error) {
		logError(`Failed hashOTP: Hashing error`, error, { action: 'hashOTP', phoneE164: maskedPhone }, req)
		throw new ApiError(500, 'OTP generation failed', [error.message])
	}

	// External Interactions
	let createdMessage
	try {
		// Store OTP in Redis
		if (resend) {
			await resendOTP(phoneE164, hashedOtp, OTP_TTL)
			logInfo(
				'OTP resent and stored successfully',
				{ action: 'resendOTP', phoneE164: maskedPhone, ttl: OTP_TTL },
				req
			)
		} else {
			await setOTP(phoneE164, hashedOtp, OTP_TTL)
			logInfo('OTP stored successfully', { action: 'setOTP', phoneE164: maskedPhone, ttl: OTP_TTL }, req)
		}

		// Send SMS
		createdMessage = await createMessage(message, phoneE164)
		const statusResult = await createdMessage?.statusCheck
		logInfo(
			'OTP sent successfully',
			{ action: 'waitForStatus', phoneE164: maskedPhone, sid: createdMessage?.sid, status: statusResult?.status },
			req
		)
	} catch (error) {
		// Rollback: Delete stored OTP
		try {
			// await deleteOTP(phoneE164)
			logWarn('OTP storage rolled back', { action: 'deleteOTP', phoneE164: maskedPhone }, req)
		} catch (rollbackError) {
			logError(
				`Failed deleteOTP: Rollback error`,
				rollbackError,
				{ action: 'deleteOTP', phoneE164: maskedPhone },
				req
			)
		}
		logError(
			`Failed sendOTP: ${error.message}`,
			error,
			{ action: 'sendOTP', phoneE164: maskedPhone, sid: createdMessage?.sid },
			req
		)
		throw new ApiError(
			500,
			'Unable to send OTP',
			[error.message],
			error.message.includes('Twilio') || error.message.includes('Message') || error.message.includes('Timeout')
				? false
				: true
		)
	}

	// Response
	logDebug(`OTP sent successfully: ${message}`, { action: 'sendOTP', phoneE164: maskedPhone }, req)
	return res.status(200).json(new ApiResponse(200, null, 'OTP sent successfully'))
})

export const verifyOTP = asyncHandler(async (req, res) => {
	// Input validation
	const { countryCode, phone, otp } = req.body
	if (!countryCode || !phone || !otp) {
		throw new ApiError(400, 'Country code, phone number and OTP are required')
	}

	const phoneE164 = countryCode.startsWith('+') ? `${countryCode}${phone}` : `+${countryCode}${phone}`
	const maskedPhone = phoneE164.replace(/(\d+)\d{4}$/, '$1XXXX')

	// Business logic
	let storedOTP, otpMatch
	try {
		storedOTP = await getOTP(phoneE164)
		if (!storedOTP) {
			logWarn('No OTP found', { action: 'getOTP', phoneE164: maskedPhone }, req)
			throw new ApiError(400, 'Invalid or expired OTP', [])
		}
		otpMatch = await bcrypt.compare(otp, storedOTP)
		if (!otpMatch) {
			logWarn('Invalid OTP', { action: 'compareOTP', phoneE164: maskedPhone }, req)
			throw new ApiError(400, 'Invalid OTP', [])
		}
	} catch (error) {
		if (error instanceof ApiError) throw error
		logError('Failed verifyOTP: OTP check error', error, { action: 'veifyOTP', phoneE164: maskedPhone }, req)
		throw new ApiError(500, 'OTP verification failed', [error.message])
	}

	// External Interactions
	let user, accessToken
	try {
		// await deleteOTP(phoneE164)
		logInfo('OTP deleted', { action: 'deleteOTP', phoneE164: maskedPhone }, req)

		// Find or create user
		user = await prisma.user.upsert({
			select: { id: true, first_name: true, last_name: true, phone_e164: true, role: true },
			where: { phone_e164: phoneE164 },
			create: { country_code: countryCode, phone: phone, phone_e164: phoneE164 },
			update: {},
		})
		logInfo(
			user.createdAt === user.updatedAt ? 'New user created' : 'Existing user found',
			{
				action: user.createdAt === user.updatedAt ? 'createUser' : 'findUser',
				userId: user.id,
				phoneE164: maskedPhone,
			},
			req
		)

		// Issue JWT
		accessToken = (await issueJWT(user)).accessToken
		req = { ...req, user: { id: user.id } }
		logDebug('JWT issued', { action: 'issueJWT' }, req)
	} catch (error) {
		logError(
			`Failed verifyOTP: ${error.message}`,
			error,
			{ action: 'externalInteractions', phoneE164: maskedPhone },
			req
		)
		if (error.code === 'p2002') {
			throw new ApiError(409, 'Phone number already taken', [error.message])
		}
		throw new ApiError(500, 'User or token processing failed', [error.message])
	}

	// Response
	return res.status(200).json(
		new ApiResponse(
			200,
			{
				user: {
					userId: user?.id,
					phoneE164: user?.phone_e164,
					firstName: user?.first_name,
					lastName: user?.last_name,
					role: user?.role,
					profilePicUrl: user?.profile_pic_url,
				},
				accessToken: accessToken,
			},
			'OTP verified successfully'
		)
	)
})
