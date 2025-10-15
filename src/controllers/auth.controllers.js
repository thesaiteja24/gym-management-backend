import { createMessage } from '../services/messaging.service.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import crypto from 'crypto'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import {
	setOTP,
	resendOTP,
	getOTP,
	deleteOTP,
	getRefreshToken,
	setRefreshToken,
	deleteRefreshToken,
} from '../services/caching.service.js'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../generated/prisma/client.js'
import { withAccelerate } from '@prisma/extension-accelerate'
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../utils/tokens.js'

const OTP_TTL = process.env.OTP_TTL
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS)
const prisma = new PrismaClient().$extends(withAccelerate())

const generateOTP = (length = 6) => {
	if (length < 6) throw new Error('OTP length too short')
	const max = 10 ** length
	const n = crypto.randomInt(0, max)
	return n.toString().padStart(length, '0')
}

export const sendOTP = asyncHandler(async (req, res) => {
	// Input Validation
	const { countryCode, phone, resend = false } = req.body
	if (!countryCode || !phone) {
		logError(
			`Failed sendOTP: Missing country code or phone`,
			null,
			{ action: 'sendOTP', phoneE164: 'unknown' },
			req
		)
		throw new ApiError(400, 'Missing country code or phone', [])
	}
	const phoneE164 = countryCode.startsWith('+') ? `${countryCode}${phone}` : `+${countryCode}${phone}`
	const maskedPhone = phoneE164.replace(/(\d+)\d{4}$/, '$1XXXX')

	// Business Logic
	const otp = generateOTP(6)
	const message = `${otp} is your otp for verification. Valid for ${OTP_TTL}`
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
			logInfo('OTP resent', { action: 'resendOTP', phoneE164: maskedPhone, ttl: OTP_TTL }, req)
		} else {
			await setOTP(phoneE164, hashedOtp, OTP_TTL)
			logInfo('OTP stored', { action: 'setOTP', phoneE164: maskedPhone, ttl: OTP_TTL }, req)
		}

		// Send SMS
		createdMessage = await createMessage(message, phoneE164)
		const statusResult = await createdMessage.statusCheck
		logInfo(
			'OTP sent',
			{ action: 'waitForStatus', phoneE164: maskedPhone, sid: statusResult.sid, status: statusResult.status },
			req
		)
	} catch (error) {
		// Rollback: Delete stored OTP
		try {
			await deleteOTP(phoneE164)
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
	logDebug(`OTP sent: ${message}`, { action: 'sendOTP', phoneE164: maskedPhone }, req)
	return res.status(200).json(new ApiResponse(200, null, 'OTP sent successfully'))
})

export const verifyOTP = asyncHandler(async (req, res) => {
	// Input Validation
	const { countryCode, phone, otp } = req.body
	if (!countryCode || !phone || !otp) {
		logError(
			`Failed verifyOTP: Missing country code, phone, or OTP`,
			null,
			{ action: 'verifyOTP', phoneE164: 'unknown' },
			req
		)
		throw new ApiError(400, 'Missing country code, phone, or OTP', [])
	}
	const phoneE164 = countryCode.startsWith('+') ? `${countryCode}${phone}` : `+${countryCode}${phone}`
	const maskedPhone = phoneE164.replace(/(\d+)\d{4}$/, '$1XXXX')

	// Business Logic
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
		logError(`Failed verifyOTP: OTP check error`, error, { action: 'verifyOTP', phoneE164: maskedPhone }, req)
		throw new ApiError(500, 'OTP verification failed', [error.message])
	}

	// External Interactions
	let user, accessToken, refreshToken
	try {
		await deleteOTP(phoneE164)
		logInfo('OTP deleted', { action: 'deleteOTP', phoneE164: maskedPhone }, req)

		// Find or create user
		user = await prisma.user.upsert({
			select: {
				id: true,
				first_name: true,
				last_name: true,
				phone_e164: true,
				role: true,
				profile_pic_url: true,
			},
			where: { phone_e164: phoneE164 },
			create: { country_code: countryCode, phone, phone_e164: phoneE164 },
			update: {},
		})
		logInfo(
			user.createdAt === user.updatedAt ? 'New user created' : 'User found',
			{
				action: user.createdAt === user.updatedAt ? 'createUser' : 'findUser',
				userId: user.id,
				phoneE164: maskedPhone,
			},
			req
		)

		// Issue JWT
		accessToken = await issueAccessToken(user)
		refreshToken = await issueRefreshToken(user)
		logDebug('Tokens issued', { action: 'issueTokens', userId: user.id }, req)
	} catch (error) {
		logError(
			`Failed verifyOTP: ${error.message}`,
			error,
			{ action: 'externalInteractions', phoneE164: maskedPhone },
			req
		)
		if (error.code === 'P2002') {
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
					userId: user.id,
					phoneE164: user.phone_e164,
					firstName: user.first_name,
					lastName: user.last_name,
					role: user.role,
					profilePicUrl: user.profile_pic_url,
				},
				accessToken,
			},
			'OTP verified successfully'
		)
	)
})

export const refreshToken = asyncHandler(async (req, res) => {
	// Input Validation
	const { userId } = req.body
	if (!userId) {
		logError(`Failed refreshToken: Missing user ID`, null, { action: 'refreshToken', userId: 'unknown' }, req)
		throw new ApiError(400, 'Missing user ID', [])
	}

	// Business Logic
	let storedToken, decoded
	try {
		storedToken = await getRefreshToken(userId)
		if (!storedToken) {
			logWarn('No refresh token found', { action: 'getRefreshToken', userId }, req)
			throw new Error('No refresh token found')
		}
		decoded = verifyRefreshToken(storedToken)
	} catch (error) {
		logWarn('Invalid refresh token', { action: 'verifyRefreshToken', userId }, req)
		throw new ApiError(401, 'Invalid or expired refresh token, please login again', [error.message])
	}

	// External Interactions
	let user, newAccessToken, newRefreshToken
	try {
		// Fetch user
		user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				first_name: true,
				last_name: true,
				phone_e164: true,
				role: true,
				profile_pic_url: true,
			},
		})
		if (!user) {
			logError(`Failed refreshToken: User not found`, null, { action: 'findUser', userId }, req)
			throw new Error('User not found')
		}

		// Delete old refresh token
		await deleteRefreshToken(userId)
		logInfo('Old refresh token deleted', { action: 'deleteRefreshToken', userId }, req)

		// Issue new tokens
		newAccessToken = await issueAccessToken(user)
		newRefreshToken = await issueRefreshToken(user) // Stores new refresh token in Redis
		logInfo('Tokens refreshed', { action: 'refreshToken', userId }, req)
	} catch (error) {
		logError(`Failed refreshToken: ${error.message}`, error, { action: 'refreshToken', userId }, req)
		throw new ApiError(401, 'Token refresh failed', [error.message])
	}

	// Response
	return res.status(200).json(
		new ApiResponse(
			200,
			{
				user: {
					userId: user.id,
					phoneE164: user.phone_e164,
					firstName: user.first_name,
					lastName: user.last_name,
					role: user.role,
					profilePicUrl: user.profile_pic_url,
				},
				accessToken: newAccessToken,
			},
			'Token refreshed successfully'
		)
	)
})
