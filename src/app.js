// app.js
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { morganStream } from './utils/logger.js'
import { globalErrorHandler } from './middlewares/globalErrorHandler.js'
import { indexRoutes } from './routes/index.routes.js'

const app = express()
const corsOptions = {
	origin: process.env.CORS_ORIGIN,
}

// ---- morgan setup: put BEFORE any routes are declared ----
morgan.token('user-id', req => req.user?.id || 'anonymous')
morgan.token('client-ip', req => req.ip || (req.ips && req.ips[0]) || req.headers['x-forwarded-for'] || 'unknown')

// include tokens in format so the stream only receives the final formatted string
app.use(
	morgan(':method :url :status :res[content-length] - :response-time ms :user-id :client-ip', {
		stream: {
			write: message => morganStream.write(message, app.get('req')),
		},
		immediate: false,
		skip: req => {
			app.set('req', req) // make req available to morganStream
			return false
		},
	})
)
// -----------------------------------------------------------

app.use(cors(corsOptions))

app.use(express.json({ limit: '16kb' }))
app.use(express.urlencoded({ extended: true, limit: '16kb' }))
app.use(express.static('public'))

// routes declaration
app.use('/api/v1', indexRoutes)

// global error handler
app.use(globalErrorHandler)

export { app }
