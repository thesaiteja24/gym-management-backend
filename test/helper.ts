import { ServerResponse } from 'node:http'
import { buildApp } from '../src/app'

// Patch ServerResponse.end for Bun / light-my-request compatibility.
// Bun's ServerResponse.end() sometimes returns early in inject() tests without setting
// writableEnded to true, causing Fastify to attempt to send headers twice.
const originalEnd = ServerResponse.prototype.end
ServerResponse.prototype.end = function (
  this: ServerResponse,
  chunk?: unknown,
  encoding?: unknown,
  cb?: unknown,
) {
  Object.defineProperty(this, 'writableEnded', {
    value: true,
    configurable: true,
  })
  const fn = originalEnd as (
    chunk?: unknown,
    encoding?: unknown,
    cb?: unknown,
  ) => ServerResponse
  return fn.call(this, chunk, encoding, cb)
}

export async function getTestApp() {
  process.env.NODE_ENV = 'test'
  process.env.MASTER_URL ||= 'postgresql://postgres:password@localhost:9003/pump_test?sslmode=disable'
  process.env.REDIS_URL ||= 'redis://localhost:9004'
  process.env.GOOGLE_WEB_CLIENT_ID ||= 'test-client-id'
  process.env.SESSION_SECRET ||= 'test-session-secret-that-is-at-least-32-characters'

  const app = await buildApp()
  await app.ready()
  return app
}
