import Redis from 'ioredis'
import { logDebug, logError, logInfo } from '../utils/logger.js'
import ms from 'ms'

let redisClient

try {
	redisClient = new Redis(process.env.REDIS_URL, {
		lazyConnect: true,
		maxRetriesPerRequest: 3,
		enableReadyCheck: true,
		tls: process.env.NODE_ENV !== 'dev' ? {} : undefined,
	})

	// Eager connect for early failure detection
	redisClient.connect().catch(err => {
		logError('Failed redisInit: Connection error', err, { error: err.mesage }, null)
		throw new Error(`Redis connection failed`)
	})

	redisClient.on('connect', () => {
		logInfo('Redis connection establishment successful', {}, null)
	})

	redisClient.on('error', err => {
		logError('Redis Failure: connection error', { error: err.message }, null)
	})

	redisClient.on('ready', async () => {
		logInfo('Redis client is ready to use', {}, null)
		// Health check ping
		const pong = await redisClient.ping()
		if (pong !== 'PONG') {
			throw new Error('Redis ping failed')
		}
	})

	redisClient.on('close', () => {
		logInfo('Redis connection closed', {}, null)
	})
} catch (error) {
	logError('Failed redisInit: Setup error', error, { error: error.message }, null)
	throw new Error('Redis setup failed')
}

process.on('SIGINT', async () => {
	if (redisClient) {
		await redisClient.quit()
		logInfo('Redis client disconnected through app termination', {}, null)
	}
	process.exit(0)
})

// Handle TTL parsing and validation
export const ttlHandler = providedTTL => {
	if (!providedTTL) throw new Error('TTL is missing')

	try {
		const seconds = ms(providedTTL) / 1000
		const milliseconds = ms(providedTTL)

		if (isNaN(seconds) || seconds <= 0) {
			throw new Error('Invalid TTL format or non-positive value')
		}

		return { seconds, milliseconds }
	} catch (error) {
		throw new Error(`TTL Error: parse error`)
	}
}

// --- OTP Management ---
export const setOTP = async (phoneE164, otp, providedTTL, options = { force: false }) => {
	const ttl = ttlHandler(providedTTL)
	const key = `otp:${phoneE164}`
	const args = [key, otp, 'EX', ttl.seconds]

	if (!options.force) args.push('NX') // Only set if not exists

	const result = await redisClient.set(...args)
	if (result !== 'OK') {
		throw new Error(`Failed to set OTP: ${options.force ? 'Unexpected Redis error' : 'Cache key already exists'}`)
	}

	return true
}

// Get OTP (returns null if missing/expired; no throw)
export const getOTP = async phoneE164 => {
	const key = `otp:${phoneE164}`
	return (await redisClient.get(key)) || null
}

// Delete OTP (returns boolean; throws on Redis error)
export const deleteOTP = async phoneE164 => {
	const key = `otp:${phoneE164}`
	const deleted = await redisClient.del(key)
	return deleted > 0
}

// For resends: Delete old, set new (throws on failure)
export const resendOTP = async (phoneE164, newOtp, providedTTL) => {
	const success = await deleteOTP(phoneE164)
	if (!success && !newOtp) {
		throw new Error('Failed to clear previous OTP')
	}
	return await setOTP(phoneE164, newOtp, providedTTL, { force: true })
}

// --- Refresh Token Management ---
export const setRefreshToken = async (userId, token, providedTTL, renew = false) => {
	const ttl = ttlHandler(providedTTL)
	const key = 'refreshToken:' + userId
	const args = [key, token, 'EX', ttl.seconds]
	if (!renew) args.push('NX') // Only set if not exists

	const result = await redisClient.set(...args)
	if (result !== 'OK') {
		throw new Error(`Failed to set Refresh Token: ${renew ? 'Unexpected Redis error' : 'Cache key already exists'}`)
	}

	return true
}

// Retrieving the refresh token using userId as key
export const getRefreshToken = async userId => {
	const key = `refreshToken:${userId}`
	return (await redisClient.get(key)) || null
}

// Deleting the refresh token using userId as key
export const deleteRefreshToken = async userId => {
	const key = `refreshToken:${userId}`
	const deleted = await redisClient.del(key)
	return deleted > 0
}

export { redisClient }
