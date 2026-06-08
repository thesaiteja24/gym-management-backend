/* eslint-disable max-lines-per-function */
import type { OneSignalError } from '@/services/onesignal.service'
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { OneSignalService } from '@/services/onesignal.service'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

describe('OneSignalService', () => {
  it('throws a non-retryable error when credentials are missing', async () => {
    const service = new OneSignalService({
      ONESIGNAL_APP_ID: undefined,
      ONESIGNAL_API_KEY: undefined,
      ONESIGNAL_ANDROID_CHANNEL_ID: undefined,
    })

    await expect(service.sendHabitReminder({
      deliveryId: 'delivery-1',
      userId: 'user-1',
      habitTitle: 'Drink Water',
    })).rejects.toMatchObject({
      name: 'OneSignalError',
      retryable: false,
    } satisfies Partial<OneSignalError>)
  })

  it('sends the expected OneSignal payload and returns the provider id', async () => {
    let request: RequestInit | undefined
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      request = init
      return new Response(JSON.stringify({ id: 'provider-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const service = new OneSignalService({
      ONESIGNAL_APP_ID: 'app-id',
      ONESIGNAL_API_KEY: 'api-key',
      ONESIGNAL_ANDROID_CHANNEL_ID: 'urgent-channel',
    })

    const result = await service.sendHabitReminder({
      deliveryId: 'delivery-1',
      userId: 'user-1',
      habitTitle: 'Drink Water',
    })

    expect(result).toEqual({ providerId: 'provider-123' })
    expect(request?.method).toBe('POST')
    expect(request?.headers).toEqual({
      'authorization': 'Key api-key',
      'content-type': 'application/json',
    })
    expect(JSON.parse(String(request?.body))).toEqual({
      app_id: 'app-id',
      android_channel_id: 'urgent-channel',
      target_channel: 'push',
      include_aliases: {
        external_id: ['user-1'],
      },
      headings: {
        en: 'Habit reminder',
      },
      contents: {
        en: 'Drink Water',
      },
      idempotency_key: 'delivery-1',
    })
  })

  it('marks 5xx responses as retryable errors', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('temporary outage', { status: 503 })
    }) as unknown as typeof fetch

    const service = new OneSignalService({
      ONESIGNAL_APP_ID: 'app-id',
      ONESIGNAL_API_KEY: 'api-key',
      ONESIGNAL_ANDROID_CHANNEL_ID: 'urgent-channel',
    })

    await expect(service.sendHabitReminder({
      deliveryId: 'delivery-1',
      userId: 'user-1',
      habitTitle: 'Drink Water',
    })).rejects.toMatchObject({
      name: 'OneSignalError',
      retryable: true,
    } satisfies Partial<OneSignalError>)
  })
})
