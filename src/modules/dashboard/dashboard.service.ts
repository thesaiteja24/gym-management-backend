import type { HabitCategory } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { HabitTargetPeriod, HabitTrackingType } from '@prisma/client'
import { calculateCompletionPercentage, calculateStreakStats, getLocalDateKey, getPeriodForDate, isPeriodCompleted, sumLogValues } from '@/modules/habit/habit.stats'
import { getDashboardActivityDates, getDashboardDatePreferences, getDashboardHabits } from './dashboard.queries'

const STREAK_WINDOW_DAYS = 30

const habitVisualFallbacks: Record<HabitCategory, { icon: string, colorScheme: string }> = {
  training: { icon: 'dumbbell', colorScheme: 'voltage' },
  nutrition: { icon: 'utensils', colorScheme: 'sky' },
  recovery: { icon: 'heart-pulse', colorScheme: 'graphite' },
  bodyMetrics: { icon: 'scalemass', colorScheme: 'graphite' },
  lifestyle: { icon: 'circle-check', colorScheme: 'sky' },
}

type DashboardHabit = Awaited<ReturnType<typeof getDashboardHabits>>['habits'][number]
type DashboardHabitLog = Awaited<ReturnType<typeof getDashboardHabits>>['logs'][number]

function dateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getHeatmapIntensity(input: {
  trackingType: HabitTrackingType
  targetValue: unknown
  value: unknown
  completed: boolean
}) {
  if (input.trackingType === HabitTrackingType.binary) {
    return input.completed ? 4 : 0
  }

  const targetValue = Number(input.targetValue ?? 0)
  const value = Number(input.value ?? 0)
  return targetValue > 0 ? Math.min(4, Math.ceil((value / targetValue) * 4)) : 0
}

function getHeatmapStatus(input: {
  date: string
  todayKey: string
  startDate: Date
  endDate: Date | null
  intensity: number
}) {
  if (input.date > input.todayKey) {
    return 'future' as const
  }

  if (input.date < toDateKey(input.startDate) || (input.endDate && input.date > toDateKey(input.endDate))) {
    return 'skipped' as const
  }

  if (input.intensity === 4) {
    return 'completed' as const
  }

  return input.intensity > 0 ? 'partial' as const : 'missed' as const
}

function calculateStreakWeeks(completedDates: string[], today: Date, weekStartsOn: number) {
  const completedDateSet = new Set(completedDates)
  let streakWeeks = 0

  for (let cursor = today; ; cursor = addDays(cursor, -7)) {
    const week = getPeriodForDate(cursor, 'weekly', weekStartsOn)
    const hasCompletedDate = Array.from(completedDateSet)
      .some(date => date >= week.key && date < getLocalDateKey('UTC', week.end))

    if (!hasCompletedDate) {
      return streakWeeks
    }

    streakWeeks += 1
  }
}

export async function getDashboardStreak(app: FastifyInstance, userId: string) {
  const preferences = await getDashboardDatePreferences(app, userId)
  const todayKey = getLocalDateKey(preferences.timezone)
  const today = dateOnly(todayKey)
  const start = addDays(today, -(STREAK_WINDOW_DAYS - 1))
  const end = addDays(today, 1)
  const activity = await getDashboardActivityDates(app, {
    userId,
    start: addDays(start, -1),
    end: addDays(end, 1),
  })
  const completedDates = [...new Set([
    ...activity.habitLogs.map(log => getLocalDateKey(preferences.timezone, log.date)),
    ...activity.workouts.flatMap(workout => workout.startTime ? [getLocalDateKey(preferences.timezone, workout.startTime)] : []),
  ])]
    .filter(date => date >= start.toISOString().slice(0, 10))
    .filter(date => date <= todayKey)
    .sort()

  return {
    streakWeeks: calculateStreakWeeks(completedDates, today, preferences.weekStartsOn),
    completedDates,
  }
}

function getHabitProgress(input: { habit: DashboardHabit, habitLogs: DashboardHabitLog[], today: Date, todayKey: string, weekStartsOn: number }) {
  const { habit, habitLogs, today, todayKey, weekStartsOn } = input
  const currentPeriod = getPeriodForDate(today, habit.targetPeriod, weekStartsOn)
  const periodLogs = habitLogs.filter(log => log.date >= currentPeriod.start && log.date < currentPeriod.end)
  const completed = isPeriodCompleted(habit, periodLogs, currentPeriod)
  const targetValue = habit.trackingType === HabitTrackingType.binary ? 1 : Number(habit.targetValue)
  const todayLog = habitLogs.find(log => toDateKey(log.date) === todayKey)

  if (habit.trackingType === HabitTrackingType.binary) {
    return {
      value: completed ? 1 : 0,
      todayValue: todayLog?.completed ? 1 : 0,
      targetValue,
      completionPercent: completed ? 100 : 0,
      completed,
      todayCompleted: todayLog?.completed === true,
    }
  }

  const value = sumLogValues(periodLogs, currentPeriod)
  const todayValue = Number(todayLog?.value ?? 0)
  return {
    value,
    todayValue,
    targetValue,
    completionPercent: Math.min(100, Math.round((value / targetValue) * 100)),
    completed,
    todayCompleted: todayValue >= targetValue,
  }
}

function getHeatmapCells(habit: DashboardHabit, logsByDate: Map<string, DashboardHabitLog>, dateKeys: string[], todayKey: string) {
  return dateKeys.map((date) => {
    const log = logsByDate.get(date)
    const intensity = log ? getHeatmapIntensity({ ...habit, value: log.value, completed: log.completed }) : 0
    return { date, intensity, status: getHeatmapStatus({ ...habit, date, todayKey, intensity }) }
  })
}

function buildDashboardHabitCard(input: {
  habit: DashboardHabit
  logs: DashboardHabitLog[]
  dateKeys: string[]
  monthlyPeriod: ReturnType<typeof getPeriodForDate>
  today: Date
  todayKey: string
  weekStartsOn: number
}) {
  const { habit, logs, dateKeys, monthlyPeriod, today, todayKey, weekStartsOn } = input
  const habitLogs = logs.filter(log => log.habitId === habit.id)
  const logsByDate = new Map(habitLogs.map(log => [toDateKey(log.date), log]))
  const progress = getHabitProgress({ habit, habitLogs, today, todayKey, weekStartsOn })
  const fallback = habitVisualFallbacks[habit.category]

  return {
    id: habit.id,
    title: habit.title,
    icon: habit.icon ?? fallback.icon,
    colorScheme: habit.colorScheme ?? fallback.colorScheme,
    trackingType: habit.trackingType,
    source: habit.source,
    progress: {
      ...progress,
      unit: habit.unit,
    },
    monthCompletionPercent: calculateCompletionPercentage({ habit, logs: habitLogs, period: monthlyPeriod, weekStartsOn, throughDate: today }),
    currentStreakDays: calculateStreakStats(habit, habitLogs, today, weekStartsOn).currentStreak,
    heatmap: getHeatmapCells(habit, logsByDate, dateKeys, todayKey),
  }
}

export async function getDashboardHabitCards(app: FastifyInstance, userId: string) {
  const preferences = await getDashboardDatePreferences(app, userId)
  const todayKey = getLocalDateKey(preferences.timezone)
  const today = dateOnly(todayKey)
  const monthlyPeriod = getPeriodForDate(today, HabitTargetPeriod.monthly, preferences.weekStartsOn)
  const { habits, logs } = await getDashboardHabits(app, { userId, today, logStartDate: monthlyPeriod.start })
  const dateKeys = Array.from(
    { length: (monthlyPeriod.end.getTime() - monthlyPeriod.start.getTime()) / 86_400_000 },
    (_, index) => toDateKey(addDays(monthlyPeriod.start, index)),
  )

  return {
    window: {
      startDate: toDateKey(monthlyPeriod.start),
      endDate: toDateKey(addDays(monthlyPeriod.end, -1)),
      todayDate: todayKey,
      weekStartsOn: preferences.weekStartsOn,
    },
    habits: habits.map(habit => buildDashboardHabitCard({
      habit,
      logs,
      dateKeys,
      monthlyPeriod,
      today,
      todayKey,
      weekStartsOn: preferences.weekStartsOn,
    })),
  }
}
