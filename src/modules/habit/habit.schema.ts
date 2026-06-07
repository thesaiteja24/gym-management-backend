import {
  HabitCategory,
  HabitLogSource,
  HabitReminderDeliveryStatus,
  HabitSource,
  HabitTargetPeriod,
  HabitTrackingType,
  InternalHabitMetric,
} from '@prisma/client'
import { z } from 'zod'
import { isValidTimeZone } from '@/utils/timezone'

const SHORT_TEXT_MAX = 128
const MEDIUM_TEXT_MAX = 512
const LONG_TEXT_MAX = 2000

const DecimalNumberSchema = z.coerce.number()
const OptionalPositiveTargetSchema = z.number().positive().max(99999999.99).optional()

export const HabitIdParamsSchema = z.object({
  habitId: z.uuid(),
})

export const HabitLogParamsSchema = z.object({
  habitId: z.uuid(),
  date: z.iso.date(),
})

export const HabitLogListQuerySchema = z.object({
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
}).refine(data => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
  path: ['endDate'],
  message: 'endDate must be on or after startDate',
})

export const HabitReminderParamsSchema = z.object({
  habitId: z.uuid(),
  reminderId: z.uuid(),
})

export const HabitInternalMetricParamsSchema = z.object({
  metric: z.enum(InternalHabitMetric),
})

export const HabitResSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  colorScheme: z.string().nullable(),
  category: z.enum(HabitCategory),
  trackingType: z.enum(HabitTrackingType),
  targetPeriod: z.enum(HabitTargetPeriod),
  targetValue: DecimalNumberSchema.nullable(),
  unit: z.string().nullable(),
  source: z.enum(HabitSource),
  internalMetric: z.string().nullable(),
  isActive: z.boolean(),
  startDate: z.date().or(z.iso.datetime()).or(z.iso.date()),
  endDate: z.date().or(z.iso.datetime()).or(z.iso.date()).nullable(),
  sortOrder: z.number(),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
}).strict()

export const HabitLogResSchema = z.object({
  id: z.uuid(),
  habitId: z.uuid(),
  date: z.date().or(z.iso.datetime()).or(z.iso.date()),
  value: DecimalNumberSchema.nullable(),
  completed: z.boolean(),
  source: z.enum(HabitLogSource),
  note: z.string().nullable(),
  metadata: z.any().nullable(),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
}).strict()

export const HabitTodayItemResSchema = HabitResSchema.extend({
  todayValue: DecimalNumberSchema.nullable(),
  completed: z.boolean(),
  currentStreak: z.number().int().nonnegative(),
}).strict()

export const HabitStatsResSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  streakPeriod: z.enum(HabitTargetPeriod),
  weeklyCompletion: z.number().int().min(0).max(100),
  monthlyCompletion: z.number().int().min(0).max(100),
  totalCompletedPeriods: z.number().int().nonnegative(),
}).strict()

export const HabitReminderResSchema = z.object({
  id: z.uuid(),
  habitId: z.uuid(),
  time: z.string(),
  timezone: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  nextTriggerAt: z.date().or(z.iso.datetime()).nullable(),
  isEnabled: z.boolean(),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
}).strict()

export const HabitReminderDeliveryResSchema = z.object({
  id: z.uuid(),
  reminderId: z.uuid(),
  scheduledAt: z.date().or(z.iso.datetime()),
  status: z.enum(HabitReminderDeliveryStatus),
  attempts: z.number().int().nonnegative(),
  sentAt: z.date().or(z.iso.datetime()).nullable(),
  providerId: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.date().or(z.iso.datetime()),
  updatedAt: z.date().or(z.iso.datetime()),
}).strict()

function validateHabitTarget(data: {
  trackingType?: HabitTrackingType
  targetValue?: number
  unit?: string
}) {
  const trackingType = data.trackingType
  if (!trackingType) {
    return true
  }

  if (['quantity', 'duration', 'count'].includes(trackingType) && data.targetValue === undefined) {
    return false
  }

  if (['quantity', 'duration'].includes(trackingType) && !data.unit) {
    return false
  }

  return true
}

export const HabitCreateReqSchema = z.object({
  title: z.string().trim().min(1).max(SHORT_TEXT_MAX),
  description: z.string().trim().max(LONG_TEXT_MAX).optional(),
  icon: z.string().trim().max(SHORT_TEXT_MAX).optional(),
  colorScheme: z.string().trim().max(SHORT_TEXT_MAX).optional(),
  category: z.enum(HabitCategory),
  trackingType: z.enum(HabitTrackingType),
  targetPeriod: z.enum(HabitTargetPeriod).default('daily'),
  targetValue: OptionalPositiveTargetSchema,
  unit: z.string().trim().min(1).max(SHORT_TEXT_MAX).optional(),
  source: z.literal(HabitSource.manual).default(HabitSource.manual),
  startDate: z.iso.date(),
  endDate: z.iso.date().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
}).strict().refine(validateHabitTarget, {
  message: 'targetValue is required for quantity, duration, and count habits; unit is required for quantity and duration habits',
}).refine(data => !data.endDate || data.startDate <= data.endDate, {
  path: ['endDate'],
  message: 'endDate must be on or after startDate',
})

export const HabitUpdateReqSchema = z.object({
  title: z.string().trim().min(1).max(SHORT_TEXT_MAX).optional(),
  description: z.string().trim().max(LONG_TEXT_MAX).nullable().optional(),
  icon: z.string().trim().max(SHORT_TEXT_MAX).nullable().optional(),
  colorScheme: z.string().trim().max(SHORT_TEXT_MAX).nullable().optional(),
  category: z.enum(HabitCategory).optional(),
  trackingType: z.enum(HabitTrackingType).optional(),
  targetPeriod: z.enum(HabitTargetPeriod).optional(),
  targetValue: OptionalPositiveTargetSchema.nullable(),
  unit: z.string().trim().min(1).max(SHORT_TEXT_MAX).nullable().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

export const HabitInternalToggleReqSchema = z.object({
  isActive: z.boolean(),
}).strict()

export const HabitLogUpsertReqSchema = z.object({
  value: z.number().nonnegative().max(99999999.99).optional(),
  completed: z.boolean().optional(),
  note: z.string().trim().max(MEDIUM_TEXT_MAX).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

const ReminderTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Reminder time must match HH:mm')
const ReminderDaysOfWeekSchema = z.array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine(days => new Set(days).size === days.length, {
    message: 'daysOfWeek values must be unique',
  })
const ReminderTimezoneSchema = z.string().trim().refine(isValidTimeZone, {
  message: 'Timezone must be a valid IANA timezone identifier',
})

export const HabitReminderCreateReqSchema = z.object({
  time: ReminderTimeSchema,
  timezone: ReminderTimezoneSchema.optional(),
  daysOfWeek: ReminderDaysOfWeekSchema,
  isEnabled: z.boolean().default(true),
}).strict()

export const HabitReminderUpdateReqSchema = z.object({
  time: ReminderTimeSchema.optional(),
  timezone: ReminderTimezoneSchema.optional(),
  daysOfWeek: ReminderDaysOfWeekSchema.optional(),
  isEnabled: z.boolean().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
})

export type HabitCreateInput = z.infer<typeof HabitCreateReqSchema>
export type HabitUpdateInput = z.infer<typeof HabitUpdateReqSchema>
export type HabitLogUpsertInput = z.infer<typeof HabitLogUpsertReqSchema>
export type HabitReminderCreateInput = z.infer<typeof HabitReminderCreateReqSchema>
export type HabitReminderUpdateInput = z.infer<typeof HabitReminderUpdateReqSchema>
