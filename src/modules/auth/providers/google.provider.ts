import { OAuth2Client } from 'google-auth-library'
import { ApiError } from '../../../utils/ApiError.js'
import type { GooglePayload } from '../types.js'

// CONSTANTS
const googleClientId = process.env.GOOGLE_WEB_CLIENT_ID
const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID
const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID
const googleClient = new OAuth2Client(googleClientId)

// FUNCTIONS

/**
 * Verifies a Google ID token and returns the decoded payload.
 * @param idToken The Google ID token to verify
 * @returns Decoded Google payload
 */
export async function verifyGoogleToken(idToken: string): Promise<GooglePayload> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: [googleClientId, googleAndroidClientId, googleIosClientId].filter(
        Boolean,
      ) as string[],
    })
    const payload = ticket.getPayload()
    if (!payload) throw new ApiError(401, 'Invalid Google payload')
    
    return payload as GooglePayload
  } catch (_error) {
    throw new ApiError(401, 'Invalid Google Token')
  }
}
