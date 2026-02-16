import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import {
	deleteOTP,
	deleteRefreshToken,
	getOTP,
	getRefreshToken,
	resendOTP,
	setOTP,
} from '../../common/services/caching.service.js'
import { createMessage } from '../../common/services/messaging.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logError, logInfo, logWarn } from '../../common/utils/logger.js'
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../../common/utils/tokens.js'

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
	const { countryCode, phone, resend = false } = req.body
	const phoneE164 = countryCode.startsWith('+') ? `${countryCode}${phone}` : `+${countryCode}${phone}`
	const maskedPhone = phoneE164.replace(/(\d+)\d{4}$/, '$1XXXX')

	const phoneEnabled = process.env.PHONE_ENABLED === 'true'

	if (!phoneEnabled) {
		logWarn('Phone verification disabled', { action: 'sendOTP', phoneE164: maskedPhone }, req)
		return res.status(200).json(new ApiResponse(200, null, 'Phone verification disabled at the moment'))
	}

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
	privacyAccepted?: boolean
	privacyPolicyVersion?: string
}

export const verifyOTP = asyncHandler(async (req: Request<object, object, VerifyOTPBody>, res: Response) => {
	const { countryCode, phone, otp, privacyAccepted, privacyPolicyVersion } = req.body
	const phoneE164 = countryCode.startsWith('+') ? `${countryCode}${phone}` : `+${countryCode}${phone}`
	const maskedPhone = phoneE164.replace(/(\d+)\d{4}$/, '$1XXXX')

	const phoneEnabled = process.env.PHONE_ENABLED === 'true'

	if (!phoneEnabled) {
		logWarn('Phone verification disabled', { action: 'sendOTP', phoneE164: maskedPhone }, req)
		return res.status(200).json(new ApiResponse(200, null, 'Phone verification disabled at the moment'))
	}

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
			create: {
				countryCode: countryCode,
				phone,
				phoneE164: phoneE164,
				...(privacyAccepted && {
					privacyPolicyAcceptedAt: new Date(),
					privacyPolicyVersion: privacyPolicyVersion,
				}),
			},
			update: {
				...(privacyAccepted && {
					privacyPolicyAcceptedAt: new Date(),
					privacyPolicyVersion: privacyPolicyVersion,
				}),
			},
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
					privacyPolicyAcceptedAt: (user as any).privacyPolicyAcceptedAt,
					privacyPolicyVersion: (user as any).privacyPolicyVersion,
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
	const { userId } = req.body

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
				privacyPolicyAcceptedAt: true,
				privacyPolicyVersion: true,
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

interface GoogleLoginBody {
	idToken: string
	privacyAccepted?: boolean
	privacyPolicyVersion?: string
}

export const googleLogin = asyncHandler(async (req: Request<object, object, GoogleLoginBody>, res: Response) => {
	const { idToken, privacyAccepted, privacyPolicyVersion } = req.body
	const googleClientId = process.env.GOOGLE_WEB_CLIENT_ID
	const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID
	const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID

	if (!idToken) throw new ApiError(400, 'Google ID Token is required')

	const client = new OAuth2Client(googleClientId)

	let payload
	try {
		const ticket = await client.verifyIdToken({
			idToken,
			audience: [googleClientId, googleAndroidClientId, googleIosClientId].filter(Boolean) as string[],
		})
		payload = ticket.getPayload()
	} catch (error) {
		const err = error as Error
		logError(`Failed googleLogin: Verification error`, err, { action: 'verifyGoogleToken' }, req)
		throw new ApiError(401, 'Invalid Google Token')
	}

	if (!payload) throw new ApiError(401, 'Invalid Google Token Payload')

	const { sub: googleId, email, given_name, family_name, picture } = payload

	if (!email) throw new ApiError(400, 'Google account must have an email')

	// Business Logic & External Interactions
	let user
	let accessToken: string
	try {
		// Find user by googleId or email
		user = await prisma.user.findFirst({
			where: {
				OR: [{ googleId }, { email }],
			},
			select: {
				id: true,
				firstName: true,
				lastName: true,
				phoneE164: true,
				role: true,
				profilePicUrl: true,
				email: true,
				googleId: true,
				privacyPolicyAcceptedAt: true,
				privacyPolicyVersion: true,
			},
		})

		if (user) {
			// Update googleId if missing
			if (!user.googleId) {
				user = await prisma.user.update({
					where: { id: user.id },
					data: { googleId },
					select: {
						id: true,
						firstName: true,
						lastName: true,
						phoneE164: true,
						role: true,
						profilePicUrl: true,
						email: true,
						googleId: true,
						privacyPolicyAcceptedAt: true,
						privacyPolicyVersion: true,
					},
				})
			}

			// Always update privacy policy if accepted, regardless of whether googleId was just linked
			if (privacyAccepted) {
				user = await prisma.user.update({
					where: { id: user.id },
					data: {
						privacyPolicyAcceptedAt: new Date(),
						privacyPolicyVersion: privacyPolicyVersion,
					},
					select: {
						id: true,
						firstName: true,
						lastName: true,
						phoneE164: true,
						role: true,
						profilePicUrl: true,
						email: true,
						googleId: true,
						privacyPolicyAcceptedAt: true,
						privacyPolicyVersion: true,
					},
				})
			}
		} else {
			// Create new user
			user = await prisma.user.create({
				data: {
					email,
					googleId,
					firstName: given_name,
					lastName: family_name,
					profilePicUrl: picture,
					role: 'member', // Default role
					...(privacyAccepted && {
						privacyPolicyAcceptedAt: new Date(),
						privacyPolicyVersion: privacyPolicyVersion,
					}),
				},
				select: {
					id: true,
					firstName: true,
					lastName: true,
					phoneE164: true,
					role: true,
					profilePicUrl: true,
					email: true,
					googleId: true,
					privacyPolicyAcceptedAt: true,
					privacyPolicyVersion: true,
				},
			})
			logInfo('New user created via Google', { action: 'createUser', userId: user.id }, req)
		}

		// Issue JWTs
		accessToken = await issueAccessToken(user)
		await issueRefreshToken(user)
		logDebug('Tokens issued for Google login', { action: 'issueTokens', userId: user.id }, req)
	} catch (error) {
		const err = error as Error
		logError(`Failed googleLogin: Database error`, err, { action: 'googleLogin', email }, req)
		throw new ApiError(500, 'Login failed', [err.message])
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
					email: user.email,
					privacyPolicyAcceptedAt: (user as any).privacyPolicyAcceptedAt,
					privacyPolicyVersion: (user as any).privacyPolicyVersion,
				},
				accessToken,
			},
			'Google login successful'
		)
	)
})
