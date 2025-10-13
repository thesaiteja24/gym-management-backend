import http from 'http'
import { app } from './app.js'
import { logError, logInfo } from './utils/logger.js'

const PORT = process.env.PORT || 9999

const server = http.createServer(app)

server.listen(PORT, '0.0.0.0', () => {
	const mockReq = { user: null, ip: '127.0.0.1' }
	logInfo(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`, {}, mockReq)
})

process.on('unhandledRejection', reason => {
	logError(
		'Unhandled Rejection',
		reason instanceof Error ? reason : new Error(String(reason)),
		{},
		{ ip: '127.0.0.1' }
	)
})

process.on('uncaughtException', err => {
	logError('Uncaught Exception', err, {}, { ip: '127.0.0.1' })
})

process.on('SIGINT', () => {
	console.log('SIGINT received, shutting down gracefully')
	server.close(() => {
		process.exit(0)
	})
})
