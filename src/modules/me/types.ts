import type { Gender, LengthUnits, WeightUnits } from '@prisma/client'

import type { UserRole } from '../../types/index.js'

// MAIN

export interface SelfUser {
  id: string
  firstName: string | null
  lastName: string | null
  profilePicUrl: string | null
  followersCount: number
  followingCount: number
  isPro: boolean
  proSubscriptionType: string | null
  email: string | null
  countryCode: string | null
  phone: string | null
  height: number | null
  weight: number | null
  preferredLengthUnit: 'cm' | 'inches' | null
  preferredWeightUnit: 'kg' | 'lbs' | null
  dateOfBirth: string | Date | null
  gender: string | null
  role: UserRole
  privacyPolicyAcceptedAt: string | Date | null
  privacyPolicyVersion: string | null
  phoneE164: string | null
  createdAt: string | Date
  updatedAt: string | Date
}

// PAYLOAD

export interface UpdateProfileBody {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  countryCode?: string
  height?: number
  weight?: number
  preferredLengthUnit?: LengthUnits
  preferredWeightUnit?: WeightUnits
  dateOfBirth?: string
  gender?: Gender
}

// RESPONSE
