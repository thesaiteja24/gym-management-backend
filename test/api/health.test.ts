import type { Mock } from 'bun:test'
import type { FastifyTypedInstance } from '@/types/index'
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { getTestApp } from '../helper'

// Mock Prisma
mock.module('@prisma/client', () => {
  return {
    PrismaClient: class {
      $connect = mock(() => Promise.resolve(undefined))
      $disconnect = mock(() => Promise.resolve(undefined))
      $queryRaw = mock(() => Promise.resolve([{ 1: 1 }]))
    },
  }
})

// Mock PG Pool
mock.module('pg', () => {
  class Pool {
    end = mock(() => Promise.resolve(undefined))
    on = mock(() => {})
  }
  return {
    Pool,
    default: { Pool },
  }
})

// Mock Adapter
mock.module('@prisma/adapter-pg', () => ({
  PrismaPg: mock(() => {}),
}))

describe('health Check', () => {
  let app: FastifyTypedInstance

  beforeAll(async () => {
    // Set a dummy URL for tests
    process.env.MASTER_URL = 'postgresql://localhost:5432/test'
    app = (await getTestApp()) as FastifyTypedInstance
  })

  afterAll(async () => {
    if (app)
      await app.close()
  })

  it('should return 200 OK when DB is healthy', async () => {
    // Setup successful DB query
    (app.prisma.$queryRaw as unknown as Mock<() => Promise<unknown>>).mockImplementationOnce(() => Promise.resolve([{ 1: 1 }]))

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('OK')
    expect(body.meta).toHaveProperty('timestamp')
    expect(body.data).toHaveProperty('uptime')
  })

  it('should return 500 when DB check fails', async () => {
    // Setup failed DB query
    (app.prisma.$queryRaw as unknown as Mock<() => Promise<unknown>>).mockImplementationOnce(() => Promise.reject(new Error('DB Connection Failed')))

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(response.statusCode).toBe(500)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.message).toBe('Internal Server Error')
  })

  it('should return 404 for non-existent route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/non-existent',
    })

    expect(response.statusCode).toBe(404)
  })
})
