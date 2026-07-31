import { z } from 'zod'

export const DashboardStreakResSchema = z.object({
  streakWeeks: z.number().int().nonnegative(),
  completedDates: z.array(z.iso.date()),
}).strict()

const DashboardHabitHeatmapCellSchema = z.object({
  date: z.iso.date(),
  intensity: z.number().int().min(0).max(4),
  status: z.enum(['completed', 'partial', 'missed', 'future', 'skipped']),
}).strict()

const DashboardHabitProgressSchema = z.object({
  value: z.number().nonnegative(),
  todayValue: z.number().nonnegative(),
  targetValue: z.number().positive(),
  unit: z.string().nullable(),
  completionPercent: z.number().int().min(0).max(100),
  completed: z.boolean(),
  todayCompleted: z.boolean(),
}).strict()

const DashboardHabitCardSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  icon: z.string(),
  colorScheme: z.string(),
  trackingType: z.enum(['binary', 'quantity', 'duration', 'count']),
  source: z.enum(['manual', 'internal', 'integration']),
  progress: DashboardHabitProgressSchema,
  monthCompletionPercent: z.number().int().min(0).max(100),
  currentStreakDays: z.number().int().nonnegative(),
  heatmap: z.array(DashboardHabitHeatmapCellSchema).min(28).max(31),
}).strict()

export const DashboardHabitsResSchema = z.object({
  window: z.object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    todayDate: z.iso.date(),
    weekStartsOn: z.number().int().min(0).max(6),
  }).strict(),
  habits: z.array(DashboardHabitCardSchema),
}).strict()
