import type { FastifyTypedInstance } from '@/types/index'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getTestApp } from '../helper'

describe('API Documentation (Scalar)', () => {
  let app: FastifyTypedInstance

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
  })

  afterAll(async () => {
    if (app)
      await app.close()
  })

  it('should successfully compile schemas and return the OpenAPI JSON definition', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs/json',
    })

    expect(response.statusCode).toBe(200)
    const spec = JSON.parse(response.body)
    expect(spec).toHaveProperty('openapi')
    expect(spec.info.title).toBe('Pump API')
  })

  it('should load the Scalar UI HTML page', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs/',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
  })

  it('should load the docs login helper without caching session tokens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs/login',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toContain('https://accounts.google.com/gsi/client')
    expect(response.body).toContain('ux_mode: \'redirect\'')
    expect(response.body).toContain('/docs/login/callback')
    expect(response.body).toContain('test-client-id')
  })
})
