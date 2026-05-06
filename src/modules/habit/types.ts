import type { HabitSource, HabitTrackingType, HabitFooterType } from '@prisma/client'

// MAIN

export interface Habit {
  id: string
  userId: string
  title: string
  colorScheme: string
  trackingType: HabitTrackingType
  targetValue: number | null
  unit: string | null
  footerType: HabitFooterType
  source: HabitSource
  internalMetricId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface HabitLog {
  id: string
  habitId: string
  date: string // ISO date string for response
  value: number
}

// PAYLOAD

export interface CreateHabitBody {
  title: string
  colorScheme: string
  trackingType: HabitTrackingType
  targetValue?: number | null
  unit?: string | null
  footerType?: HabitFooterType
  source?: HabitSource
  internalMetricId?: string | null
}

export type UpdateHabitBody = Partial<CreateHabitBody>

export interface LogHabitBody {
  date: string
  value: number
}

// RESPONSE

export type HabitLogsMap = Record<string, { date: string; value: number }[]>
