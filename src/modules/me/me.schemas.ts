import {
  ActivityLevel,
  EquipmentType,
  FitnessGoal,
  FitnessLevel,
  Gender,
  LengthUnits,
  TargetType,
  UserRole,
  WeightUnits,
} from '@prisma/client'
import { z } from 'zod'

import * as self from './me.schemas'

const SHORT_TEXT_MAX = 128
const MEDIUM_TEXT_MAX = 512
const LONG_TEXT_MAX = 2000
const URL_LIST_MAX = 8

// Hoisted functions to avoid use-before-define lint errors with lazy circular references
function resolveNutritionRes(): typeof self.NutritionResSchema {
  return self.NutritionResSchema
}

function resolveNutritionUpsertReq(): typeof self.NutritionUpsertReqSchema {
  return self.NutritionUpsertReqSchema
}

/**
 * Zod schema for validating the query response containing user profile details.
 */
export const ProfileResSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  profilePicUrl: z.string(),
  followersCount: z.number(),
  followingCount: z.number(),
  workoutsCount: z.number(),
  isPro: z.boolean(),
  proSubscriptionType: z.string().nullable(),
  email: z.email(),
  height: z.coerce.number().nullable(),
  weight: z.coerce.number().nullable(),
  preferredLengthUnit: z.enum(LengthUnits),
  preferredWeightUnit: z.enum(WeightUnits),
  dateOfBirth: z.date().or(z.iso.datetime()).or(z.iso.date()).nullable(),
  gender: z.enum(Gender).nullable(),
  role: z.enum(UserRole),
  privacyPolicyAcceptedAt: z.date().or(z.iso.datetime()),
  privacyPolicyVersion: z.string(),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
}).strict()

/**
 * Zod schema for validating request bodies for updating user profile details.
 */
export const ProfileUpdateReqSchema = z.object({
  firstName: z.string().trim().min(1).max(SHORT_TEXT_MAX).optional(),
  lastName: z.string().trim().min(1).max(SHORT_TEXT_MAX).optional(),
  height: z.number().positive({ message: 'Height must be greater than 0' }).max(300).optional(),
  weight: z.number().positive({ message: 'Weight must be greater than 0' }).max(1000).optional(),
  preferredLengthUnit: z.enum(LengthUnits, { message: 'Preferred length unit must be one of the allowed values' }).optional(),
  preferredWeightUnit: z.enum(WeightUnits, { message: 'Preferred weight unit must be one of the allowed values' }).optional(),
  dateOfBirth: z.iso.date().refine(d => d.toString() <= new Date().toISOString(), { message: 'Date cannot be in the future' }).optional(),
  gender: z.enum(Gender, { message: 'Gender must be one of the allowed values' }).optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

/**
 * Inferred TypeScript type for user profile updates.
 */
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateReqSchema>

/**
 * Zod schema for validating the query response containing a user fitness profile.
 */
export const FitnessResSchema = z.object({
  id: z.string(),
  fitnessGoal: z.enum(FitnessGoal).nullable(),
  fitnessLevel: z.enum(FitnessLevel).nullable(),
  injuries: z.string().nullable(),
  availableEquipment: z.array(z.enum(EquipmentType)),
  targetDate: z.date().or(z.iso.datetime()).or(z.iso.date()).nullable(),
  targetWeight: z.coerce.number().nullable(),
  activityLevel: z.enum(ActivityLevel).nullable(),
  targetBodyFat: z.coerce.number().nullable(),
  targetType: z.enum(TargetType).nullable(),
  weeklyWeightChange: z.coerce.number().nullable(),
  nutritionPlan: z.lazy(resolveNutritionRes).nullable().optional(),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
})

/**
 * Zod schema for validating request bodies for upserting a user fitness profile.
 */
export const FitnessUpsertReqSchema = z.object({
  fitnessGoal: z.enum(FitnessGoal).optional(),
  fitnessLevel: z.enum(FitnessLevel).optional(),
  injuries: z.string().trim().max(LONG_TEXT_MAX).optional(),
  availableEquipment: z.array(z.enum(EquipmentType)).max(Object.values(EquipmentType).length).optional(),
  targetDate: z.iso.date().optional(),
  targetWeight: z.number().positive().max(1000).optional(),
  activityLevel: z.enum(ActivityLevel).optional(),
  targetBodyFat: z.number().positive().max(100).optional(),
  targetType: z.enum(TargetType).optional(),
  weeklyWeightChange: z.number().min(-10).max(10).optional(),
  nutritionPlan: z.lazy(resolveNutritionUpsertReq).optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

/**
 * Inferred TypeScript type for fitness profile upserts.
 */
export type FitnessUpsertInput = z.infer<typeof FitnessUpsertReqSchema>

/**
 * Zod schema for validating the query response containing a user nutrition plan.
 */
export const NutritionResSchema = z.object({
  id: z.string(),
  caloriesTarget: z.number().nullable(),
  proteinTarget: z.number().nullable(),
  carbsTarget: z.number().nullable(),
  fatsTarget: z.number().nullable(),
  calculatedTDEE: z.number().nullable(),
  deficitOrSurplus: z.number().nullable(),
  startDate: z.date().or(z.iso.datetime()).or(z.iso.date()),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
})

/**
 * Zod schema for validating request bodies for updating a user nutrition plan.
 */
export const NutritionUpsertReqSchema = z.object({
  caloriesTarget: z.number().positive().max(20000).optional(),
  proteinTarget: z.number().positive().max(2000).optional(),
  carbsTarget: z.number().positive().max(3000).optional(),
  fatsTarget: z.number().positive().max(2000).optional(),
  calculatedTDEE: z.number().positive().max(20000).optional(),
  deficitOrSurplus: z.number().min(-10000).max(10000).optional(),
  startDate: z.iso.date().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

/**
 * Inferred TypeScript type for nutrition plan updates.
 */
export type NutritionUpsertInput = z.infer<typeof NutritionUpsertReqSchema>

// Definition of standard measurement fields
const measurementMetrics = {
  weight: z.coerce.number().max(1000),
  waist: z.coerce.number().max(300),
  bodyFat: z.coerce.number().max(100),
  leanBodyMass: z.coerce.number().max(1000),
  neck: z.coerce.number().max(200),
  shoulders: z.coerce.number().max(300),
  chest: z.coerce.number().max(300),
  abdomen: z.coerce.number().max(300),
  hips: z.coerce.number().max(300),
  leftBicep: z.coerce.number().max(200),
  rightBicep: z.coerce.number().max(200),
  leftForearm: z.coerce.number().max(200),
  rightForearm: z.coerce.number().max(200),
  leftThigh: z.coerce.number().max(250),
  rightThigh: z.coerce.number().max(250),
  leftCalf: z.coerce.number().max(200),
  rightCalf: z.coerce.number().max(200),
}

// Convert metrics to coerced number nullable forms for outputs
const nullableMeasurementMetrics = Object.fromEntries(
  Object.entries(measurementMetrics).map(([key, val]) => [key, val.nullable()]),
) as unknown as { [K in keyof typeof measurementMetrics]: z.ZodNullable<z.ZodNumber> }

// Convert metrics to optional positive constraints for inputs
const inputMeasurementMetrics = Object.fromEntries(
  Object.entries(measurementMetrics).map(([key, val]) => [key, val.positive().optional()]),
) as unknown as { [K in keyof typeof measurementMetrics]: z.ZodOptional<z.ZodNumber> }

/**
 * Zod schema for validating a single measurement log entry in query results.
 */
export const MeasurementEntrySchema = z.object({
  id: z.uuid(),
  date: z.any(),
  ...nullableMeasurementMetrics,
  notes: z.string().nullable(),
  progressPicUrls: z.array(z.string()),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
})

/**
 * Zod schema for validating request bodies for creating or updating measurements.
 */
export const MeasurementReqSchema = z.object({
  date: z.iso.datetime({
    error: (issue) => {
      if (issue.input === undefined) {
        return 'Date should not be empty'
      }
      return 'Invalid date format'
    },
  })
    .refine(
      d => d.toString() <= new Date().toISOString(),
      { message: 'Date cannot be in the future' },
    ),
  ...inputMeasurementMetrics,
  notes: z.string().trim().max(MEDIUM_TEXT_MAX).optional(),
  progressPicUrls: z.array(z.url()).max(URL_LIST_MAX).optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

/**
 * Inferred TypeScript type for creating or updating body measurements.
 */
export type MeasurementInput = z.infer<typeof MeasurementReqSchema>

/**
 * Zod schema for validating UUID URL parameters identifying a measurement.
 */
export const MeasurementIdParamsSchema = z.object({
  id: z.uuid(),
})

/**
 * Zod schema for validating query parameters when fetching measurement history.
 */
export const MeasurementsQuerySchema = z.object({
  duration: z.enum(['all', 'week', 'month', 'year']).default('all'),
})

/**
 * Zod schema for validating query responses containing measurement history and metrics.
 */
export const MeasurementsResSchema = z.object({
  history: z.array(MeasurementEntrySchema),
  latestValues: z.any(),
  dailyWeightChange: z.object({
    diff: z.number(),
    isPositive: z.boolean(),
  }).nullable(),
})

/**
 * Zod schema for validating user workout and streak analytics query responses.
 */
export const AnalyticsResSchema = z.object({
  workoutsThisWeek: z.number(),
  weeklyVolume: z.number(),
  lastWeekVolume: z.number(),
  weeklyDuration: z.number(),
  lastWeekDuration: z.number(),
  weeklyReps: z.number(),
  lastWeekReps: z.number(),
  streakDays: z.number(),
  daysSinceLastWorkout: z.number(),
  workoutDates: z.array(z.string()),
})
