import { PrismaClient } from '@prisma/client'
import http from 'http'

import { app } from './app.js'
import { logger } from './utils/logger.js'

const PORT = process.env.PORT || 9999

const server = http.createServer(app)

const checkDbConnection = async (retries = 3, delay = 1500) => {
  const prisma = new PrismaClient()
  for (let i = 1; i <= retries; i++) {
    try {
      await prisma.$connect()
      logger.info('Database connection successfully established')
      await prisma.$disconnect()
      return
    } catch (err) {
      if (i === retries) {
        logger.fatal({ err }, 'CRITICAL: Database connection failed after 3 retries')
        process.exit(1)
      }
      logger.warn(`Database connection failed, retrying... (${i}/3)`)
      await new Promise((res) => setTimeout(res, delay))
    }
  }
}

server.listen(PORT, async () => {
  logger.info(`Server successfully started on port ${PORT} in ${process.env.NODE_ENV || 'dev'} mode`)
  await checkDbConnection()
})

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ err: reason }, 'Unhandled Rejection')
  server.close(() => process.exit(1))
})

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught Exception')
  server.close(() => process.exit(1))
})

process.on('SIGINT', () => {
  server.close(() => {
    logger.info('Server gracefully closed via SIGINT')
    process.exit(0)
  })
})
