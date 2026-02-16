import winston from 'winston'
import path from 'path'
import fs from 'fs'
import { LoggerRequest } from '../types/index.js'

// ─────────────────────────────────────────────
// Ensure a logs directory exists
// ─────────────────────────────────────────────
const logDir = path.resolve('logs')
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir)
}

// ─────────────────────────────────────────────
// Define custom log levels (higher number = lower priority)
// ─────────────────────────────────────────────
const customLevels: winston.config.AbstractConfigSetLevels = {
	error: 0,
	warn: 1,
	info: 2,
	http: 3,
	verbose: 4,
	debug: 5,
}

// ─────────────────────────────────────────────
// Define a consistent log format
// ─────────────────────────────────────────────
const logFormat = winston.format.combine(
	winston.format.timestamp(),
	winston.format.printf(({ level, message, timestamp, userId, ip, ...meta }) => {
		const userIdStr = userId ? `userId=${userId} ` : 'userId=anonymous '
		const ipStr = ip ? `ip=${ip} ` : 'ip=unknown '
		return `[${timestamp}] ${level.toUpperCase()}: ${userIdStr}${ipStr}${message} ${
			Object.keys(meta).length ? JSON.stringify(meta) : ''
		}`
	})
)

const consoleFormat = winston.format.combine(
	winston.format.colorize(),
	winston.format.timestamp(),
	winston.format.printf(({ level, message, timestamp, userId, ip, ...meta }) => {
		const userIdStr = userId ? `userId=${userId} ` : 'userId=anonymous '
		const ipStr = ip ? `ip=${ip} ` : 'ip=unknown '
		return `[${timestamp}] ${level}: ${userIdStr}${ipStr}${message} ${
			Object.keys(meta).length ? JSON.stringify(meta) : ''
		}`
	})
)

// ─────────────────────────────────────────────
// Create transports for file + console logging
// ─────────────────────────────────────────────
const transports: winston.transport[] = [
	new winston.transports.File({
		filename: path.join(logDir, 'error.log'),
		level: 'error',
	}),
	new winston.transports.File({
		filename: path.join(logDir, 'combined.log'),
		level: 'info',
	}),
	new winston.transports.File({
		filename: path.join(logDir, 'http.log'),
		level: 'http',
	}),
]

// ─────────────────────────────────────────────
// Add console logging in non-production env
// ─────────────────────────────────────────────

transports.push(
	new winston.transports.Console({
		format: consoleFormat,
		level: process.env.NODE_ENV !== 'dev' ? 'http' : 'debug',
	})
)

// ─────────────────────────────────────────────
// Create Winston logger instance
// ─────────────────────────────────────────────
const logger = winston.createLogger({
	levels: customLevels,
	level: process.env.NODE_ENV !== 'dev' ? 'http' : 'debug',
	format: logFormat,
	transports,
})

// ─────────────────────────────────────────────
// Helper methods for clean usage in app code
// ─────────────────────────────────────────────
export const logInfo = (msg: string, meta: Record<string, unknown> = {}, req: LoggerRequest | null = null): void => {
	logger.info(msg, {
		...meta,
		userId: req?.user?.id || null,
		ip: req?.ip || req?.ips?.[0] || 'unknown',
	})
}

export const logWarn = (msg: string, meta: Record<string, unknown> = {}, req: LoggerRequest | null = null): void => {
	logger.warn(msg, {
		...meta,
		userId: req?.user?.id || null,
		ip: req?.ip || req?.ips?.[0] || 'unknown',
	})
}

export const logDebug = (msg: string, meta: Record<string, unknown> = {}, req: LoggerRequest | null = null): void => {
	logger.debug(msg, {
		...meta,
		userId: req?.user?.id || null,
		ip: req?.ip || req?.ips?.[0] || 'unknown',
	})
}

export const logHttp = (msg: string, meta: Record<string, unknown> = {}, req: LoggerRequest | null = null): void => {
	logger.http(msg, {
		...meta,
		userId: req?.user?.id || null,
		ip: req?.ip || req?.ips?.[0] || 'unknown',
	})
}

export const logError = (
	msg: string,
	err: Error | null,
	meta: Record<string, unknown> = {},
	req: LoggerRequest | null = null
): void => {
	logger.error(msg, {
		...meta,
		userId: req?.user?.id || null,
		ip: req?.ip || req?.ips?.[0] || 'unknown',
		error: err?.message || '',
		stack: err?.stack || '',
	})
}

// ─────────────────────────────────────────────
// Export Morgan-compatible stream for request logging
// ─────────────────────────────────────────────
export const morganStream = {
	write: (message: string, req?: LoggerRequest): void => {
		// Pass userId and clientIp from req if available
		logger.http(message.trim(), {
			userId: req?.user?.id || null,
			ip: req?.ip || req?.ips?.[0] || 'unknown',
		})
	},
}

export default logger
