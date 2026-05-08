import type { SelfUser } from './types.js'

/**
 * Helper to format Prisma Decimal types to numbers.
 */
export function formatPrismaDecimal(val: any): number | null {
  if (val === null || val === undefined) return null
  return typeof val.toNumber === 'function' ? val.toNumber() : Number(val)
}

/**
 * Helper to format Prisma Date types to ISO strings.
 */
export function formatPrismaDate(val: any): string | null {
  if (val === null || val === undefined) return null
  return typeof val.toISOString === 'function' ? val.toISOString() : String(val)
}

/**
 * Formats a raw user object from Prisma into a SelfUser response.
 */
export function formatSelfUser(user: any): SelfUser {
  if (!user) return null as any

  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    profilePicUrl: user.profilePicUrl ?? null,
    followersCount: user.followersCount ?? 0,
    followingCount: user.followingCount ?? 0,
    workoutsCount: user._count?.workoutLogs ?? 0,
    isPro: user.isPro ?? false,
    proSubscriptionType: user.proSubscriptionType ?? null,
    email: user.email ?? null,
    countryCode: user.countryCode ?? null,
    phone: user.phone ?? null,
    height: formatPrismaDecimal(user.height),
    weight: formatPrismaDecimal(user.weight),
    preferredLengthUnit: user.preferredLengthUnit ?? null,
    preferredWeightUnit: user.preferredWeightUnit ?? null,
    dateOfBirth: formatPrismaDate(user.dateOfBirth),
    gender: user.gender ?? null,
    role: user.role,
    privacyPolicyAcceptedAt: formatPrismaDate(user.privacyPolicyAcceptedAt),
    privacyPolicyVersion: user.privacyPolicyVersion ?? null,
    phoneE164: user.phoneE164 ?? null,
    createdAt: formatPrismaDate(user.createdAt) as any,
    updatedAt: formatPrismaDate(user.updatedAt) as any,
  }
}

export function formatFitnessProfile(profile: any) {
  if (!profile) return null
  return {
    ...profile,
    targetWeight: formatPrismaDecimal(profile.targetWeight),
    targetBodyFat: formatPrismaDecimal(profile.targetBodyFat),
    weeklyWeightChange: formatPrismaDecimal(profile.weeklyWeightChange),
  }
}

export function formatNutritionPlan(plan: any) {
  if (!plan) return null
  return {
    ...plan,
  }
}

/**
 * Formats a single measurement entry by converting Prisma decimals to numbers.
 */
export function formatMeasurementEntry(entry: any) {
  if (!entry) return null
  const { userId: _, createdAt: __, updatedAt: ___, ...rest } = entry
  const formatted: any = { ...rest }

  for (const key in formatted) {
    if (key !== 'id' && key !== 'date' && key !== 'progressPicUrls') {
      formatted[key] = formatted[key] !== null ? Number(formatted[key]) : null
    }
  }
  return formatted
}
