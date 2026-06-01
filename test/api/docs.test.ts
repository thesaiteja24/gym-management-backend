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
})
