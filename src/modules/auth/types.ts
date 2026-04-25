import { UserRole } from '@prisma/client'
import type { SelfUser } from '../me/types.js'

// MAIN

export interface GooglePayload {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  given_name?: string
  family_name?: string
  locale?: string
}

export interface UserForToken {
  id: string
  role: UserRole
  phoneE164?: string | null
  email?: string | null
}

export interface TokenPayload {
  id: string
  role: UserRole
  email: string | null
  phoneE164: string | null
}

// PAYLOAD

export interface RefreshTokenBody {
  refreshToken: string
}

export interface GoogleLoginBody {
  idToken: string
  privacyAccepted?: boolean
  privacyPolicyVersion?: string
}

// RESPONSE

export interface AuthResponse {
  user: SelfUser
  accessToken: string
  refreshToken: string
}
