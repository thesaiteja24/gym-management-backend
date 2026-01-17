import { Request, Response } from 'express'
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
	deleteRefreshToken,
} from '../services/caching.service.js'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../utils/tokens.js'

const OTP_TTL = process.env.OTP_TTL!
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS)
const prisma = new PrismaClient().$extends(withAccelerate())

const generateOTP = (length: number = 6): string => {
	if (length < 6) throw new Error('OTP length too short')
	const max = 10 ** length
	const n = crypto.randomInt(0, max)
	return n.toString().padStart(length, '0')
}

interface SendOTPBody {
	countryCode: string
	phone: string
	resend?: boolean
}

export const sendOTP = asyncHandler(async (req: Request<object, object, SendOTPBody>, res: Response) => {
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
	let hashedOtp: string
	try {
		hashedOtp = await bcrypt.hash(otp, SALT_ROUNDS)
	} catch (error) {
		const err = error as Error
		logError(`Failed hashOTP: Hashing error`, err, { action: 'hashOTP', phoneE164: maskedPhone }, req)
		throw new ApiError(500, 'OTP generation failed', [err.message])
	}

	// External Interactions
	let createdMessage: Awaited<ReturnType<typeof createMessage>> | undefined
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
		const err = error as Error
		// Rollback: Delete stored OTP
		try {
			await deleteOTP(phoneE164)
			logWarn('OTP storage rolled back', { action: 'deleteOTP', phoneE164: maskedPhone }, req)
		} catch (rollbackError) {
			logError(
				`Failed deleteOTP: Rollback error`,
				rollbackError as Error,
				{ action: 'deleteOTP', phoneE164: maskedPhone },
				req
			)
		}
		logError(
			`Failed sendOTP: ${err.message}`,
			err,
			{ action: 'sendOTP', phoneE164: maskedPhone, sid: createdMessage?.sid },
			req
		)
		throw new ApiError(500, 'Unable to send OTP', [err.message])
	}

	// Response
	logDebug(`OTP sent: ${message}`, { action: 'sendOTP', phoneE164: maskedPhone }, req)
	return res.status(200).json(new ApiResponse(200, null, 'OTP sent successfully'))
})

interface VerifyOTPBody {
	countryCode: string
	phone: string
	otp: string
}

export const verifyOTP = asyncHandler(async (req: Request<object, object, VerifyOTPBody>, res: Response) => {
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
	let storedOTP: string | null
	let otpMatch: boolean
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
		const err = error as Error
		logError(`Failed verifyOTP: OTP check error`, err, { action: 'verifyOTP', phoneE164: maskedPhone }, req)
		throw new ApiError(500, 'OTP verification failed', [err.message])
	}

	// External Interactions
	let user: {
		id: string
		firstName: string | null
		lastName: string | null
		phoneE164: string | null
		role: string
		profilePicUrl: string | null
		createdAt: Date
		updatedAt: Date
	}
	let accessToken: string
	let refreshToken: string
	try {
		// TODO: Need to implement rollback if any of the below steps fail
		await deleteOTP(phoneE164)
		logInfo('OTP deleted', { action: 'deleteOTP', phoneE164: maskedPhone }, req)

		// Find or create user
		user = await prisma.user.upsert({
			select: {
				id: true,
				firstName: true,
				lastName: true,
				phoneE164: true,
				role: true,
				profilePicUrl: true,
				createdAt: true,
				updatedAt: true,
			},
			where: { phoneE164: phoneE164 },
			create: { countryCode: countryCode, phone, phoneE164: phoneE164 },
			update: {},
		})
		logInfo(
			user.createdAt.getTime() === user.updatedAt.getTime() ? 'New user created' : 'User found',
			{
				action: user.createdAt.getTime() === user.updatedAt.getTime() ? 'createUser' : 'findUser',
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
		const err = error as Error & { code?: string }
		logError(
			`Failed verifyOTP: ${err.message}`,
			err,
			{ action: 'externalInteractions', phoneE164: maskedPhone },
			req
		)
		if (err.code === 'P2002') {
			throw new ApiError(409, 'Phone number already taken', [err.message])
		}
		throw new ApiError(500, 'User or token processing failed', [err.message])
	}

	// Response
	return res.status(200).json(
		new ApiResponse(
			200,
			{
				user: {
					userId: user.id,
					phoneE164: user.phoneE164,
					firstName: user.firstName,
					lastName: user.lastName,
					role: user.role,
					profilePicUrl: user.profilePicUrl,
				},
				accessToken,
			},
			'OTP verified successfully'
		)
	)
})

interface RefreshTokenBody {
	userId: string
}

export const refreshToken = asyncHandler(async (req: Request<object, object, RefreshTokenBody>, res: Response) => {
	// Input Validation
	const { userId } = req.body
	if (!userId) {
		logError(`Failed refreshToken: Missing user ID`, null, { action: 'refreshToken', userId: 'unknown' }, req)
		throw new ApiError(400, 'Missing user ID', [])
	}

	// Business Logic
	let storedToken: string | null
	try {
		storedToken = await getRefreshToken(userId)
		if (!storedToken) {
			logWarn('No refresh token found', { action: 'getRefreshToken', userId }, req)
			throw new Error('No refresh token found')
		}
		verifyRefreshToken(storedToken)
	} catch (error) {
		const err = error as Error
		logWarn('Invalid refresh token', { action: 'verifyRefreshToken', userId }, req)
		throw new ApiError(401, 'Invalid or expired refresh token, please login again', [err.message])
	}

	// External Interactions
	let user: {
		id: string
		firstName: string | null
		lastName: string | null
		phoneE164: string | null
		role: string
		profilePicUrl: string | null
	} | null
	let newAccessToken: string
	try {
		// Fetch user
		user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				phoneE164: true,
				role: true,
				profilePicUrl: true,
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
		await issueRefreshToken(user) // Stores new refresh token in Redis
		logInfo('Tokens refreshed', { action: 'refreshToken', userId }, req)
	} catch (error) {
		const err = error as Error
		logError(`Failed refreshToken: ${err.message}`, err, { action: 'refreshToken', userId }, req)
		throw new ApiError(401, 'Token refresh failed', [err.message])
	}

	// Response
	return res.status(200).json(
		new ApiResponse(
			200,
			{
				accessToken: newAccessToken,
			},
			'Token refreshed successfully'
		)
	)
})
