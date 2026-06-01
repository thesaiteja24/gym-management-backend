import type { FastifyInstance } from 'fastify'
import type {
  FitnessUpsertInput,
  NutritionUpsertInput,
  ProfileUpdateInput,
} from './me.schemas'
import { CACHE_KEYS, CACHE_TTL } from '@/config/cache'
import { evictCache, getOrSetCache } from '@/services/cache.service'
import { HttpError } from '@/utils/response'

const userProfileSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
  followersCount: true,
  followingCount: true,
  workoutsCount: true,
  isPro: true,
  proSubscriptionType: true,
  email: true,
  height: true,
  weight: true,
  preferredLengthUnit: true,
  preferredWeightUnit: true,
  dateOfBirth: true,
  gender: true,
  role: true,
  privacyPolicyAcceptedAt: true,
  privacyPolicyVersion: true,
  createdAt: true,
  updatedAt: true,
} as const

/**
 * Fetches the user profile by user ID.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @returns The user profile.
 * @throws HttpError 404 if user profile is not found.
 */
export async function queryUserProfile(app: FastifyInstance, userId: string) {
  const cacheKey = CACHE_KEYS.profile(userId)

  return getOrSetCache(app.redis, cacheKey, CACHE_TTL.week, async () => {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: userProfileSelect,
    })
    if (!user) {
      throw new HttpError(404, 'NOT_FOUND', 'User not found')
    }
    return user
  })
}

/**
 * Updates the fields of the user's profile.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param data Data elements to update.
 * @returns The updated profile.
 */
export async function updateUserProfile(app: FastifyInstance, userId: string, data: ProfileUpdateInput) {
  const { dateOfBirth, ...rest } = data

  const profile = await app.prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    },
    select: userProfileSelect,
  })

  // Evict cache on update
  await evictCache(app, CACHE_KEYS.profile(userId))

  return profile
}

/**
 * Fetches user fitness goals, logs, and associated nutrition targets.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @returns Formatted fitness profile details, or null.
 */
export async function queryFitnessProfile(app: FastifyInstance, userId: string) {
  const cacheKey = CACHE_KEYS.fitness(userId)

  return getOrSetCache(app.redis, cacheKey, CACHE_TTL.week, async () => {
    const [profile, nutritionPlan] = await Promise.all([
      app.prisma.userFitnessProfile.findUnique({ where: { userId } }),
      app.prisma.userNutritionPlan.findUnique({ where: { userId } }),
    ])
    if (!profile) {
      return null
    }
    return {
      ...profile,
      nutritionPlan,
    }
  })
}

/**
 * Updates or creates fitness goals along with inline nutrition targets.
 * @param app FastifyInstance.
 * @param userId The ID of the user.
 * @param data The updated goals.
 * @returns The modified fitness profile record.
 */
export async function upsertFitnessProfile(app: FastifyInstance, userId: string, data: FitnessUpsertInput) {
  const { targetDate, nutritionPlan, ...profileData } = data

  const { profile, updatedNutritionPlan } = await app.prisma.$transaction(async (tx) => {
    const profile = await tx.userFitnessProfile.upsert({
      where: { userId },
      create: {
        ...profileData,
        userId,
        targetDate: targetDate ? new Date(targetDate) : undefined,
      },
      update: {
        ...profileData,
        targetDate: targetDate ? new Date(targetDate) : undefined,
      },
    })

    let updatedNutritionPlan
    if (nutritionPlan) {
      const { startDate, ...nutritionData } = nutritionPlan
      updatedNutritionPlan = await tx.userNutritionPlan.upsert({
        where: { userId },
        create: {
          ...nutritionData,
          userId,
          startDate: startDate ? new Date(startDate) : new Date(),
        },
        update: {
          ...nutritionData,
          startDate: startDate ? new Date(startDate) : undefined,
        },
      })
    }
    else {
      updatedNutritionPlan = await tx.userNutritionPlan.findUnique({ where: { userId } })
    }

    return { profile, updatedNutritionPlan }
  })

  // Evict both fitness profile and nutrition caches
  await Promise.all([
    evictCache(app, CACHE_KEYS.fitness(userId)),
    evictCache(app, CACHE_KEYS.nutrition(userId)),
  ])

  return {
    ...profile,
    nutritionPlan: updatedNutritionPlan,
  }
}

/**
 * Fetches the user's current nutrition plan details.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @returns Formatted nutrition targets, or null.
 */
export async function queryNutritionPlan(app: FastifyInstance, userId: string) {
  const cacheKey = CACHE_KEYS.nutrition(userId)

  return getOrSetCache(app.redis, cacheKey, CACHE_TTL.week, async () => {
    return app.prisma.userNutritionPlan.findUnique({ where: { userId } })
  })
}

/**
 * Updates or creates standard nutrition target values.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param data Target metric values.
 * @returns Formatted nutrition plan targets.
 */
export async function upsertNutritionPlan(app: FastifyInstance, userId: string, data: NutritionUpsertInput) {
  const { startDate, ...nutritionData } = data

  const plan = await app.prisma.userNutritionPlan.upsert({
    where: { userId },
    create: {
      ...nutritionData,
      userId,
      startDate: startDate ? new Date(startDate) : new Date(),
    },
    update: {
      ...nutritionData,
      startDate: startDate ? new Date(startDate) : undefined,
    },
  })

  // Evict both nutrition and fitness profile caches (since fitness profile embeds nutrition plan)
  await Promise.all([
    evictCache(app, CACHE_KEYS.nutrition(userId)),
    evictCache(app, CACHE_KEYS.fitness(userId)),
  ])

  return plan
}
