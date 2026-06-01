import type { FastifyTypedInstance } from '@/types/index'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cacheDelete, cacheGet, cacheSet } from '@/services/cache.service'
import { getTestApp } from '../helper'

describe('Cache Service: Actual Redis', () => {
  let app: FastifyTypedInstance

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance
  })

  afterAll(async () => {
    if (app)
      await app.close()
  })

  describe('Lifecycle Flow (Set -> Get -> Delete)', () => {
    it('should correctly handle the lifecycle of a cached item in actual Redis', async () => {
      const key = 'test-key-lifecycle'
      const value = { foo: 'bar', timestamp: Date.now() }
      const ttl = 60

      // 1. Set
      await cacheSet(app.redis, key, value, ttl)

      // 2. Get
      const result = await cacheGet<{ foo: string, timestamp: number }>(app.redis, key)
      expect(result).toEqual(value)

      // 3. Delete
      await cacheDelete(app.redis, key)

      // 4. Get after delete
      const afterDelete = await cacheGet(app.redis, key)
      expect(afterDelete).toBeNull()
    })
  })

  describe('cacheSet Robustness (Actual Redis)', () => {
    it('should handle various data types correctly', async () => {
      const testCases = [
        { key: 'test-str', value: 'hello world' },
        { key: 'test-num', value: 12345 },
        { key: 'test-bool', value: true },
        { key: 'test-arr', value: [1, 2, 3, { a: 1 }] },
        { key: 'test-obj', value: { a: { b: { c: 1 } } } },
        { key: 'test-null', value: null },
      ]

      for (const { key, value } of testCases) {
        await cacheSet(app.redis, key, value, 60)
        const result = await cacheGet(app.redis, key)
        expect(result).toEqual(value)
        await cacheDelete(app.redis, key) // Cleanup
      }
    })
  })

  describe('cacheGet Robustness (Actual Redis)', () => {
    it('should return null if key does not exist', async () => {
      const result = await cacheGet(app.redis, 'completely-random-key-that-does-not-exist')
      expect(result).toBeNull()
    })

    it('should throw error on invalid JSON in cache', async () => {
      const key = 'test-invalid-json'
      await app.redis.set(key, 'invalid-json{')

      await expect(cacheGet(app.redis, key)).rejects.toThrow()
      await cacheDelete(app.redis, key) // Cleanup
    })
  })

  describe('cacheDelete Robustness (Actual Redis)', () => {
    it('should handle deleting non-existent keys gracefully', async () => {
      await expect(cacheDelete(app.redis, 'ghost-key-123')).resolves.toBeUndefined()
    })
  })
})
