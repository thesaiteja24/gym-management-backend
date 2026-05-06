import pino from 'pino'

const env = process.env.NODE_ENV || 'dev'

export const logger = pino({
  level: process.env.LOG_LEVEL || (env === 'dev' ? 'debug' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'token',
      'cookie',
      'refreshToken',
      'accessToken',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.accessToken'
    ],
    censor: '[Redacted]'
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname',
    },
  },
})

/**
 * Standard Logging Pattern:
 * 1. Pass an object with metadata FIRST.
 * 2. Pass the descriptive message SECOND.
 * 
 * Examples:
 * logger.info({ userId: user.id, action: 'FETCH_EXERCISES', itemsCount: 5 }, 'Successfully fetched exercises')
 * logger.error({ err, userId: user.id }, 'Failed to fetch user profile')
 */
