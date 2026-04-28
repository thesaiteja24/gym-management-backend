import http from 'http'

import { app } from './app.js'

const PORT = process.env.PORT || 9999

const server = http.createServer(app)

server.listen(PORT, () => {})

process.on('unhandledRejection', (_reason: unknown) => {
  // Silent or new logging will go here
})

process.on('uncaughtException', (_err: Error) => {
  // Silent or new logging will go here
})

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0)
  })
})
