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
    ignore: 'pid,hostname,req,res,action,method,url,ip,userId,responseTime',
    messageFormat: (log: Record<string, any>, messageKey: string) => {
      const { userId = 'unknown', ip = '-', [messageKey]: msg = '', responseTime, req, res, level } = log

      const method = String(log.method || req?.method || '-').toUpperCase()
      const url = log.url || req?.url || '-'
      const rt = responseTime || res?.responseTime || log.res?.responseTime
      const rtStr = rt ? ` ${bold(`${rt}ms`)}` : ''

      const color = methodColors[method] || ((text: string) => text)
      const baseLine = `${bold(userId)} ${bold(color(method))} ${url}${rtStr} - ${msg}`

      if (level < 50) {
        const rest = { ...log }
        const skipKeys = ['level', 'time', 'msg', 'pid', 'hostname', 'req', 'res', 'action', 'url', 'method', 'userId', 'ip', 'responseTime', messageKey]
        skipKeys.forEach((k) => delete (rest as any)[k])
        if (Object.keys(rest).length > 0) {
          return `${baseLine} ${JSON.stringify(rest)}`
        }
      }

      return baseLine
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
