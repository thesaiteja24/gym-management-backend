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
  if (!process.env.GOOGLE_WEB_CLIENT_ID) {
    process.env.GOOGLE_WEB_CLIENT_ID = 'test-client-id'
  }
  const app = await buildApp()
  await app.ready()
  return app
}
