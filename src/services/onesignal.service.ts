import type { AppConfig } from '@/config/env'

export interface SendHabitReminderInput {
  deliveryId: string
  userId: string
  habitTitle: string
}

export interface SendHabitReminderResult {
  providerId?: string
}

export class OneSignalError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'OneSignalError'
  }
}

export interface HabitReminderPushClient {
  sendHabitReminder: (input: SendHabitReminderInput) => Promise<SendHabitReminderResult>
}

export class OneSignalService implements HabitReminderPushClient {
  constructor(private readonly config: Pick<AppConfig, 'ONESIGNAL_APP_ID' | 'ONESIGNAL_API_KEY' | 'ONESIGNAL_ANDROID_CHANNEL_ID'>) {}

  async sendHabitReminder(input: SendHabitReminderInput) {
    if (!this.config.ONESIGNAL_APP_ID || !this.config.ONESIGNAL_API_KEY || !this.config.ONESIGNAL_ANDROID_CHANNEL_ID) {
      throw new OneSignalError('OneSignal credentials are not configured', false)
    }

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'authorization': `Key ${this.config.ONESIGNAL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        app_id: this.config.ONESIGNAL_APP_ID,
        android_channel_id: this.config.ONESIGNAL_ANDROID_CHANNEL_ID,
        target_channel: 'push',
        include_aliases: {
          external_id: [input.userId],
        },
        headings: {
          en: 'Habit reminder',
        },
        contents: {
          en: input.habitTitle,
        },
        idempotency_key: input.deliveryId,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      const retryable = response.status === 429 || response.status >= 500
      throw new OneSignalError(`OneSignal request failed with ${response.status}: ${body}`, retryable)
    }

    const body = await response.json().catch(() => null) as { id?: string } | null
    return { providerId: body?.id }
  }
}
