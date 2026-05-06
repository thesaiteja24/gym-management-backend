import pino from 'pino'
import pretty from 'pino-pretty'
import { blue, green, magenta, red, yellow, bold } from 'colorette'

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
            const { stack, ...errWithoutStack } = serializedErr
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

        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')
        const millis = String(date.getMilliseconds()).padStart(3, '0')

        const offsetMinutes = -date.getTimezoneOffset()
        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
        const remainingMinutes = Math.abs(offsetMinutes) % 60
        const sign = offsetMinutes >= 0 ? '+' : '-'
        const offset = `${sign}${offsetHours}:${String(remainingMinutes).padStart(2, '0')}`

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis} ${offset}`
      },
    },
    ignore: 'pid,hostname,req,res,responseTime,userId,action',
    messageFormat: (log: any, messageKey: string) => {
      const userId = log.userId || 'unknown'
      const ip = log.ip || log.req?.remoteAddress || '-'
      const method = (log.method || log.req?.method || '-').toUpperCase()
      const url = log.url || log.req?.url || '-'
      const action = log.action || '-'
      const msg = log[messageKey] || ''

      const coloredMethod = methodColors[method] ? methodColors[method](method) : method

      return `${userId} ${ip} ${bold(coloredMethod)} ${url} ${action} ${msg}`
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
