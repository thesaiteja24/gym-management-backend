// app.ts
import cors from 'cors'
import type { Express, Request } from 'express'
import express from 'express'
import { pinoHttp } from 'pino-http'

import { indexRoutes } from './index.routes.js'
import { globalErrorHandler } from './middlewares/globalErrorHandler.js'
import { logger } from './utils/logger.js'
import { mountSwagger } from './utils/swagger.js'

const app: Express = express()

const corsOptions = {
  origin: process.env.CORS_ORIGIN,
}

app.use(cors(corsOptions))

app.use(
  pinoHttp({
    logger,
    customProps: (req: Request) => ({
      userId: (req as any).user?.id,
    }),
  })
)

app.use(express.json({ limit: '16kb' }))
app.use(express.urlencoded({ extended: true, limit: '16kb' }))
app.use(express.static('public'))

// mount swagger docs
mountSwagger(app)

// routes declaration
app.use('/api/v1', indexRoutes)
app.use('/delete-account', express.static('public/delete-account.html'))
app.use('/privacy-policy', express.static('public/privacy-policy.html'))

// global error handler
app.use(globalErrorHandler)

export { app }
