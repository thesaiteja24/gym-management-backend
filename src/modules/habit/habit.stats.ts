import { HabitTargetPeriod } from '@prisma/client'

export interface HabitStatsSubject {
  startDate: Date
  endDate: Date | null
  targetPeriod: HabitTargetPeriod
  targetValue: unknown
}

export interface HabitStatsLog {
  date: Date
  value: unknown
  completed: boolean
}

interface DatePeriod {
  key: string
  start: Date
  end: Date
}

interface CompletionContext {
  habit: HabitStatsSubject
  logs: HabitStatsLog[]
  period: DatePeriod
  weekStartsOn: number
  throughDate: Date
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

export function getLocalDateKey(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function getPeriodForDate(date: Date, targetPeriod: HabitTargetPeriod, weekStartsOn: number): DatePeriod {
  if (targetPeriod === HabitTargetPeriod.daily) {
    return {
      key: toDateKey(date),
      start: date,
      end: addDays(date, 1),
    }
  }

  if (targetPeriod === HabitTargetPeriod.weekly) {
    const day = date.getUTCDay()
    const diff = (day - weekStartsOn + 7) % 7
    const start = addDays(date, -diff)
    return {
      key: toDateKey(start),
      start,
      end: addDays(start, 7),
    }
  }

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  return {
    key: toDateKey(start),
    start,
    end: addMonths(start, 1),
  }
}

function nextPeriod(period: DatePeriod, targetPeriod: HabitTargetPeriod, weekStartsOn: number) {
  if (targetPeriod === HabitTargetPeriod.daily) {
    return getPeriodForDate(addDays(period.start, 1), targetPeriod, weekStartsOn)
  }

  if (targetPeriod === HabitTargetPeriod.weekly) {
    return getPeriodForDate(addDays(period.start, 7), targetPeriod, weekStartsOn)
  }

  return getPeriodForDate(addMonths(period.start, 1), targetPeriod, weekStartsOn)
}

function buildPeriods(startDate: Date, endDate: Date, targetPeriod: HabitTargetPeriod, weekStartsOn: number) {
  const periods: DatePeriod[] = []
  const firstPeriod = getPeriodForDate(startDate, targetPeriod, weekStartsOn)
  const lastPeriod = getPeriodForDate(endDate, targetPeriod, weekStartsOn)

  for (
    let period = firstPeriod;
    period.start <= lastPeriod.start;
    period = nextPeriod(period, targetPeriod, weekStartsOn)
  ) {
    periods.push(period)
  }

  return periods
}

export function sumLogValues(logs: HabitStatsLog[], period: DatePeriod) {
  return logs.reduce((total, log) => {
    if (log.date < period.start || log.date >= period.end) {
      return total
    }

    return total + Number(log.value ?? 0)
  }, 0)
}

export function isPeriodCompleted(habit: HabitStatsSubject, logs: HabitStatsLog[], period: DatePeriod) {
  if (habit.targetPeriod === HabitTargetPeriod.daily) {
    const log = logs.find(item => toDateKey(item.date) === period.key)
    return log?.completed === true
  }

  return sumLogValues(logs, period) >= Number(habit.targetValue ?? 0)
}

function getActiveEndDate(habit: HabitStatsSubject, period: DatePeriod, throughDate: Date) {
  const periodEnd = addDays(period.end, -1)
  const throughEnd = throughDate < periodEnd ? throughDate : periodEnd
  return habit.endDate && habit.endDate < throughEnd ? habit.endDate : throughEnd
}

function calculateWeeklyCompletion(context: CompletionContext) {
  const { habit, logs, period, weekStartsOn, throughDate } = context
  const weeklyPeriod = getPeriodForDate(period.start, HabitTargetPeriod.weekly, weekStartsOn)
  if (weeklyPeriod.start.getTime() === period.start.getTime() && weeklyPeriod.end.getTime() === period.end.getTime()) {
    return isPeriodCompleted(habit, logs, period) ? 100 : 0
  }

  const activeEnd = getActiveEndDate(habit, period, throughDate)
  const weeklyPeriods = buildPeriods(period.start, activeEnd, HabitTargetPeriod.weekly, weekStartsOn)
    .filter(item => item.end > habit.startDate && (!habit.endDate || item.start <= habit.endDate))

  if (weeklyPeriods.length === 0) {
    return 0
  }

  const completedCount = weeklyPeriods.filter(item => isPeriodCompleted(habit, logs, item)).length
  return Math.round((completedCount / weeklyPeriods.length) * 100)
}

export function calculateCompletionPercentage(context: CompletionContext) {
  const { habit, logs, period, weekStartsOn, throughDate } = context

  if (habit.targetPeriod === HabitTargetPeriod.weekly) {
    return calculateWeeklyCompletion(context)
  }

  if (habit.targetPeriod === HabitTargetPeriod.monthly) {
    return isPeriodCompleted(habit, logs, period) ? 100 : 0
  }

  const activeEnd = getActiveEndDate(habit, period, throughDate)
  const periods = buildPeriods(period.start, activeEnd, HabitTargetPeriod.daily, weekStartsOn)
  const activePeriods = periods.filter(item => item.start >= habit.startDate && (!habit.endDate || item.start <= habit.endDate))

  if (activePeriods.length === 0) {
    return 0
  }

  const completedCount = activePeriods.filter(item => isPeriodCompleted(habit, logs, item)).length
  return Math.round((completedCount / activePeriods.length) * 100)
}

export function calculateStreakStats(
  habit: HabitStatsSubject,
  logs: HabitStatsLog[],
  today: Date,
  weekStartsOn: number,
) {
  const endDate = habit.endDate && habit.endDate < today ? habit.endDate : today
  if (habit.startDate > endDate) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      totalCompletedPeriods: 0,
    }
  }

  const periods = buildPeriods(habit.startDate, endDate, habit.targetPeriod, weekStartsOn)
  let bestStreak = 0
  let runningStreak = 0
  let totalCompletedPeriods = 0

  for (const period of periods) {
    if (isPeriodCompleted(habit, logs, period)) {
      runningStreak += 1
      totalCompletedPeriods += 1
      bestStreak = Math.max(bestStreak, runningStreak)
    }
    else {
      runningStreak = 0
    }
  }

  let currentStreak = 0
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const period = periods[index]
    if (!period || !isPeriodCompleted(habit, logs, period)) {
      break
    }

    currentStreak += 1
  }

  return {
    currentStreak,
    bestStreak,
    totalCompletedPeriods,
  }
}
