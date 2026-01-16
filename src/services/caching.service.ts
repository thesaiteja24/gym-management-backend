import { Redis } from 'ioredis'
import { logError, logInfo } from '../utils/logger.js'
import ms, { StringValue } from 'ms'

const redisClient = new Redis(process.env.REDIS_URL!, {
	lazyConnect: true,
	maxRetriesPerRequest: 3,
	enableReadyCheck: true,
	tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
})

// Eager connect for early failure detection
redisClient.connect().catch((err: Error) => {
	logError('Failed redisInit: Connection error', err, { error: err.message }, null)
	throw new Error(`Redis connection failed`)
})

redisClient.on('connect', () => {
	logInfo('Redis connection establishment successful', {}, null)
})

redisClient.on('error', (err: Error) => {
	logError('Redis Failure: connection error', err, { error: err.message }, null)
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

process.on('SIGINT', async () => {
	if (redisClient) {
		await redisClient.quit()
		logInfo('Redis client disconnected through app termination', {}, null)
	}
	process.exit(0)
})

interface TTLResult {
	seconds: number
	milliseconds: number
}

// Handle TTL parsing and validation
export const ttlHandler = (providedTTL: string): TTLResult => {
	if (!providedTTL) throw new Error('TTL is missing')

	try {
		const milliseconds = ms(providedTTL as StringValue)
		const seconds = milliseconds / 1000

		if (isNaN(seconds) || seconds <= 0) {
			throw new Error('Invalid TTL format or non-positive value')
		}

		return { seconds, milliseconds }
	} catch {
		throw new Error(`TTL Error: parse error`)
	}
}

// --- OTP Management ---
interface SetOTPOptions {
	force?: boolean
}

export const setOTP = async (
	phoneE164: string,
	otp: string,
	providedTTL: string,
	options: SetOTPOptions = { force: false }
): Promise<boolean> => {
	const ttl = ttlHandler(providedTTL)
	const key = `otp:${phoneE164}`

	let result: string | null
	if (options.force) {
		result = await redisClient.set(key, otp, 'EX', ttl.seconds)
	} else {
		result = await redisClient.set(key, otp, 'EX', ttl.seconds, 'NX')
	}

	if (result !== 'OK') {
		throw new Error(`Failed to set OTP: ${options.force ? 'Unexpected Redis error' : 'Cache key already exists'}`)
	}

	return true
}

// Get OTP (returns null if missing/expired; no throw)
export const getOTP = async (phoneE164: string): Promise<string | null> => {
	const key = `otp:${phoneE164}`
	return (await redisClient.get(key)) || null
}

// Delete OTP (returns boolean; throws on Redis error)
export const deleteOTP = async (phoneE164: string): Promise<boolean> => {
	const key = `otp:${phoneE164}`
	const deleted = await redisClient.del(key)
	return deleted > 0
}

// For resends: Delete old, set new (throws on failure)
export const resendOTP = async (phoneE164: string, newOtp: string, providedTTL: string): Promise<boolean> => {
	const success = await deleteOTP(phoneE164)
	if (!success && !newOtp) {
		throw new Error('Failed to clear previous OTP')
	}
	return await setOTP(phoneE164, newOtp, providedTTL, { force: true })
}

// --- Refresh Token Management ---
export const setRefreshToken = async (
	userId: string,
	token: string,
	providedTTL: string,
	renew: boolean = false
): Promise<boolean> => {
	const ttl = ttlHandler(providedTTL)
	const key = 'refreshToken:' + userId

	let result: string | null
	if (renew) {
		result = await redisClient.set(key, token, 'EX', ttl.seconds)
	} else {
		result = await redisClient.set(key, token, 'EX', ttl.seconds, 'NX')
	}

	if (result !== 'OK') {
		throw new Error(`Failed to set Refresh Token: ${renew ? 'Unexpected Redis error' : 'Cache key already exists'}`)
	}

	return true
}

// Retrieving the refresh token using userId as key
export const getRefreshToken = async (userId: string): Promise<string | null> => {
	const key = `refreshToken:${userId}`
	return (await redisClient.get(key)) || null
}

// Deleting the refresh token using userId as key
export const deleteRefreshToken = async (userId: string): Promise<boolean> => {
	const key = `refreshToken:${userId}`
	const deleted = await redisClient.del(key)
	return deleted > 0
}

export const setCache = async (key: string, value: unknown, providedTTL: string): Promise<boolean> => {
	const ttl = ttlHandler(providedTTL)

	const result = await redisClient.set(key, JSON.stringify(value), 'EX', ttl.seconds)
	if (result !== 'OK') {
		throw new Error('Failed to set cache')
	}

	return true
}

export const getCache = async <T = unknown>(key: string): Promise<T | null> => {
	const cachedValue = await redisClient.get(key)
	return cachedValue ? (JSON.parse(cachedValue) as T) : null
}

export const deleteCache = async (key: string): Promise<boolean> => {
	const deleted = await redisClient.del(key)
	return deleted > 0
}

export { redisClient }
