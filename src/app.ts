// app.ts
import cors from 'cors'
import type { Express } from 'express'
import express from 'express'

import { globalErrorHandler } from './common/middlewares/globalErrorHandler.js'
import { mountSwagger } from './common/utils/swagger.js'
import { indexRoutes } from './routes/index.routes.js'

const app: Express = express()

const corsOptions = {
  origin: process.env.CORS_ORIGIN,
}

app.use(cors(corsOptions))

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
