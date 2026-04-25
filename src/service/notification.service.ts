import * as OneSignal from '@onesignal/node-onesignal'

import { ApiError } from '../utils/ApiError.js'

/**
 * Service for handling push notifications via OneSignal
 */
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY as string
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID as string

const configuration = OneSignal.createConfiguration({
  restApiKey: ONESIGNAL_API_KEY,
})

const client = new OneSignal.DefaultApi(configuration)

export const NotificationService = {
  /**
   * Send push notification to specific users using their external_id (database userId)
   * @param userIds Array of user IDs to receive the notification
   * @param title Title of the notification
   * @param message Body content of the notification
   * @param data Optional data payload
   */
  sendPushToUsers: async (
    userIds: string[],
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> => {
    try {
      if (!userIds || userIds.length === 0) return

      const notification = new OneSignal.Notification()
      notification.app_id = ONESIGNAL_APP_ID
      notification.headings = { en: title }
      notification.contents = { en: message }
      notification.data = data
      notification.target_channel = 'push'

      // Target users by their external_id (which is their DB userId)
      notification.include_aliases = {
        external_id: userIds,
      }

      await client.createNotification(notification)
    } catch (error: any) {
      // We throw an error if it's a critical failure, but usually we don't want to break the main flow
      // depending on the context. For now, we follow the plan to log and throw.
      throw new ApiError(500, `Notification Service Error: ${error?.message || 'Unknown error'}`)
    }
  },

  /**
   * Send push notification to a segment of users (e.g., "Active Users", "Subscribed Users")
   * @param segments Array of segment names
   * @param title Title of the notification
   * @param message Body content of the notification
   * @param data Optional data payload
   */
  sendPushToSegments: async (
    segments: string[],
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> => {
    try {
      if (!segments || segments.length === 0) return

      const notification = new OneSignal.Notification()
      notification.app_id = ONESIGNAL_APP_ID
      notification.headings = { en: title }
      notification.contents = { en: message }
      notification.data = data
      notification.included_segments = segments

      await client.createNotification(notification)
    } catch (error: any) {
      throw new ApiError(500, `Notification Service Error: ${error?.message || 'Unknown error'}`)
    }
  },
}
