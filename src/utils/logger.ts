import { blue, bold, green, magenta, red, yellow } from 'colorette'
import pino from 'pino'
import pretty from 'pino-pretty'

const env = process.env.NODE_ENV || 'dev'

const methodColors: Record<string, (text: string) => string> = {
  GET: green,
  POST: yellow,
  PUT: blue,
  DELETE: red,
  PATCH: magenta,
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (env === 'dev' ? 'debug' : 'info'),
    hooks: {
      logMethod(inputArgs: any[], method: any, level: number) {
        if (level < 50) {
          if (inputArgs.length > 0 && typeof inputArgs[0] === 'object' && inputArgs[0].err) {
            const serializedErr = pino.stdSerializers.err(inputArgs[0].err)
            const { stack: _stack, ...errWithoutStack } = serializedErr
            inputArgs[0].meta = errWithoutStack
            delete inputArgs[0].err
          }
        }
        return method.apply(this, inputArgs)
      },
    },
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
        '*.accessToken',
      ],
      censor: '[Redacted]',
    },
  },
  pretty({
    colorize: true,
    translateTime: false,
    customPrettifiers: {
      time: (timestamp: any) => {
        const date = timestamp ? new Date(timestamp as number) : new Date()
        if (isNaN(date.getTime())) return String(timestamp)
        return date.toISOString()
      },
    },
    ignore: 'pid,hostname,req,res,responseTime,userId,action',
    messageFormat: (log: Record<string, any>, messageKey: string) => {
      const { userId = 'unknown', ip = '-', method: m = '-', url = '-', action = '-', [messageKey]: msg = '' } = log
      const method = String(m).toUpperCase()
      const color = methodColors[method] || ((text: string) => text)
      return `${userId} ${ip} ${bold(color(method))} ${url} ${action} ${msg}`
    },
  }),
)

/**
 * Standard Logging Pattern:
 * 1. Pass an object with metadata FIRST.
 * 2. Pass the descriptive message SECOND.
 *
 * Examples:
 * logger.info({ userId: user.id, action: 'FETCH_EXERCISES', itemsCount: 5 }, 'Successfully fetched exercises')
 * logger.error({ err, userId: user.id }, 'Failed to fetch user profile')
 */
