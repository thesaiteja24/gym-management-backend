// app.ts
import express, { Express, Request } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { morganStream } from './utils/logger.js'
import { globalErrorHandler } from './middlewares/globalErrorHandler.js'
import { indexRoutes } from './routes/index.routes.js'
import { mountSwagger } from './utils/swagger.js'

const app: Express = express()

const corsOptions = {
	origin: process.env.CORS_ORIGIN,
}

// ---- morgan setup: put BEFORE any routes are declared ----
morgan.token('user-id', (req: Request) => req.user?.id || 'anonymous')
morgan.token(
	'client-ip',
	(req: Request) => req.ip || (req.ips && req.ips[0]) || (req.headers['x-forwarded-for'] as string) || 'unknown'
)

// include tokens in format so the stream only receives the final formatted string
app.use(
	morgan(':method :url :status :res[content-length] - :response-time ms :client-ip', {
		stream: {
			write: (message: string) =>
				morganStream.write(message, (app as unknown as { get: (key: string) => Request }).get('req')),
		},
		immediate: false,
		skip: (req: Request) => {
			;(app as unknown as { set: (key: string, value: Request) => void }).set('req', req) // make req available to morganStream
			return false
		},
	})
)
// -----------------------------------------------------------

app.use(cors(corsOptions))

app.use(express.json({ limit: '16kb' }))
app.use(express.urlencoded({ extended: true, limit: '16kb' }))
app.use(express.static('public'))

// mount swagger docs
mountSwagger(app)

// routes declaration
app.use('/api/v1', indexRoutes)

// global error handler
app.use(globalErrorHandler)

export { app }
