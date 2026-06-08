import type { HabitCreateInput, HabitLogUpsertInput, HabitReminderCreateInput, HabitUpdateInput } from '../src/modules/habit/habit.schema'
import type { FastifyInstance } from 'fastify'
import type { Habit, InternalHabitMetric } from '@prisma/client'
import { HabitCategory, HabitSource, HabitTargetPeriod, HabitTrackingType } from '@prisma/client'
import { buildApp } from '../src/app'
import { createHabitReminder } from '../src/modules/habit/habit.reminder.service'
import { getLocalDateKey } from '../src/modules/habit/habit.stats'
import { createHabit, updateHabit } from '../src/modules/habit/habit.service'
import { upsertHabitLog } from '../src/modules/habit/habit.log.service'
import { backfillInternalHabitLogs } from '../src/modules/habit/habit.internal.backfill.service'

interface HabitSeedDefinition {
  title: string
  data: HabitCreateInput
  reminder?: HabitReminderCreateInput
  buildLog: (localDate: string) => HabitLogUpsertInput | null
}

interface InternalHabitSeedDefinition {
  title: string
  category: HabitCategory
  internalMetric: InternalHabitMetric
  startDate: string
  sortOrder: number
  colorScheme?: string
  icon?: string
  description?: string
}

function getArg(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function requireTargetUser() {
  const userId = getArg('user-id')
  const email = getArg('email')

  if (!userId && !email) {
    throw new Error('Pass either --user-id=<uuid> or --email=<email>')
  }

  return { userId, email }
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number) {
  const base = dateOnly(value)
  base.setUTCDate(base.getUTCDate() + days)
  return toDateKey(base)
}

function subtractDays(value: string, days: number) {
  return addDays(value, -days)
}

function weekday(value: string) {
  return dateOnly(value).getUTCDay()
}

function isWeekend(value: string) {
  const day = weekday(value)
  return day === 0 || day === 6
}

function mod(n: number, divisor: number) {
  return ((n % divisor) + divisor) % divisor
}

function dayDiff(start: string, end: string) {
  return Math.round((dateOnly(end).getTime() - dateOnly(start).getTime()) / 86400000)
}

function buildDateRange(start: string, end: string) {
  const dates: string[] = []

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(cursor)
  }

  return dates
}

function everyDayReminder(timezone: string, time: string): HabitReminderCreateInput {
  return {
    time,
    timezone,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isEnabled: true,
  }
}

function weekdayReminder(timezone: string, time: string): HabitReminderCreateInput {
  return {
    time,
    timezone,
    daysOfWeek: [1, 2, 3, 4, 5],
    isEnabled: true,
  }
}

function almostEveryDay(startDate: string, localDate: string, missedOffsets: number[]) {
  return !missedOffsets.includes(dayDiff(startDate, localDate))
}

async function resolveUser(app: FastifyInstance, input: { userId?: string, email?: string }) {
  const user = await app.prisma.user.findFirst({
    where: input.userId
      ? { id: input.userId }
      : { email: input.email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      timezone: true,
      weekStartsOn: true,
    },
  })

  if (!user) {
    throw new Error('User not found')
  }

  return user
}

async function clearSeededChildren(app: FastifyInstance, habitId: string) {
  await app.prisma.habitReminderDelivery.deleteMany({
    where: {
      reminder: {
        habitId,
      },
    },
  })

  await app.prisma.habitReminder.deleteMany({
    where: { habitId },
  })

  await app.prisma.habitLog.deleteMany({
    where: { habitId },
  })
}

async function ensureManualHabit(app: FastifyInstance, userId: string, seed: HabitSeedDefinition) {
  const existing = await app.prisma.habit.findFirst({
    where: {
      userId,
      source: HabitSource.manual,
      title: seed.title,
    },
    select: {
      id: true,
    },
  })

  if (!existing) {
    return createHabit(app, userId, seed.data)
  }

  const updateData: HabitUpdateInput = {
    title: seed.data.title,
    description: seed.data.description ?? null,
    icon: seed.data.icon ?? null,
    colorScheme: seed.data.colorScheme ?? null,
    category: seed.data.category,
    trackingType: seed.data.trackingType,
    targetPeriod: seed.data.targetPeriod,
    targetValue: seed.data.targetValue ?? null,
    unit: seed.data.unit ?? null,
    startDate: seed.data.startDate,
    endDate: seed.data.endDate ?? null,
    sortOrder: seed.data.sortOrder,
    isActive: true,
  }

  return updateHabit(app, userId, existing.id, updateData)
}

async function ensureInternalHabit(app: FastifyInstance, userId: string, seed: InternalHabitSeedDefinition) {
  const existing = await app.prisma.habit.findFirst({
    where: {
      userId,
      source: HabitSource.internal,
      title: seed.title,
    },
  })

  if (existing) {
    return app.prisma.habit.update({
      where: { id: existing.id },
      data: {
        description: seed.description,
        icon: seed.icon,
        colorScheme: seed.colorScheme,
        category: seed.category,
        trackingType: HabitTrackingType.binary,
        targetPeriod: HabitTargetPeriod.daily,
        targetValue: null,
        unit: null,
        internalMetric: seed.internalMetric,
        isActive: true,
        startDate: dateOnly(seed.startDate),
        endDate: null,
        sortOrder: seed.sortOrder,
      },
    })
  }

  return app.prisma.habit.create({
    data: {
      userId,
      title: seed.title,
      description: seed.description,
      icon: seed.icon,
      colorScheme: seed.colorScheme,
      category: seed.category,
      trackingType: HabitTrackingType.binary,
      targetPeriod: HabitTargetPeriod.daily,
      source: HabitSource.internal,
      internalMetric: seed.internalMetric,
      startDate: dateOnly(seed.startDate),
      sortOrder: seed.sortOrder,
    },
  })
}

function buildManualSeeds(timezone: string, today: string): HabitSeedDefinition[] {
  const ninetyDaysAgo = subtractDays(today, 90)
  const sixtyDaysAgo = subtractDays(today, 60)
  const fortyFiveDaysAgo = subtractDays(today, 45)
  const thirtyDaysAgo = subtractDays(today, 30)
  const twentyOneDaysAgo = subtractDays(today, 21)
  const fourteenDaysAgo = subtractDays(today, 14)
  const sevenDaysAgo = subtractDays(today, 7)

  return [
    {
      title: 'Morning Mobility',
      data: {
        title: 'Morning Mobility',
        description: 'Ten minutes of joint mobility before starting work.',
        icon: 'figure.cooldown',
        colorScheme: 'sunrise',
        category: HabitCategory.training,
        trackingType: HabitTrackingType.binary,
        targetPeriod: HabitTargetPeriod.daily,
        startDate: sixtyDaysAgo,
        sortOrder: 10,
      },
      reminder: everyDayReminder(timezone, '06:30'),
      buildLog(localDate) {
        const completed = almostEveryDay(sixtyDaysAgo, localDate, [11, 23, 37, 52])
        return { completed, note: completed ? 'Loosened hips and shoulders.' : 'Skipped due to early meetings.' }
      },
    },
    {
      title: 'Hydration Goal',
      data: {
        title: 'Hydration Goal',
        description: 'Hit 3 liters of water across the day.',
        icon: 'drop.fill',
        colorScheme: 'ocean',
        category: HabitCategory.nutrition,
        trackingType: HabitTrackingType.quantity,
        targetPeriod: HabitTargetPeriod.daily,
        targetValue: 3,
        unit: 'L',
        startDate: ninetyDaysAgo,
        sortOrder: 20,
      },
      reminder: everyDayReminder(timezone, '09:00'),
      buildLog(localDate) {
        const offset = dayDiff(ninetyDaysAgo, localDate)
        const value = [2.4, 2.8, 3.0, 3.2, 3.4, 2.7, 3.1][mod(offset, 7)]
        return {
          value,
          note: value >= 3 ? 'Kept a bottle on the desk all day.' : 'Fell short after evening travel.',
        }
      },
    },
    {
      title: 'Night Sleep Target',
      data: {
        title: 'Night Sleep Target',
        description: 'Average at least 8 hours of sleep.',
        icon: 'bed.double.fill',
        colorScheme: 'midnight',
        category: HabitCategory.recovery,
        trackingType: HabitTrackingType.duration,
        targetPeriod: HabitTargetPeriod.daily,
        targetValue: 8,
        unit: 'hours',
        startDate: fortyFiveDaysAgo,
        sortOrder: 30,
      },
      reminder: everyDayReminder(timezone, '22:15'),
      buildLog(localDate) {
        const offset = dayDiff(fortyFiveDaysAgo, localDate)
        const value = [7.2, 8.1, 8.4, 7.8, 8.0, 8.6, 7.5][mod(offset, 7)]
        return {
          value,
          note: value >= 8 ? 'Solid recovery night.' : 'Late-night work cut this short.',
        }
      },
    },
    {
      title: 'Protein Feeding Windows',
      data: {
        title: 'Protein Feeding Windows',
        description: 'Spread protein across four meals or snacks.',
        icon: 'fork.knife',
        colorScheme: 'amber',
        category: HabitCategory.bodyMetrics,
        trackingType: HabitTrackingType.count,
        targetPeriod: HabitTargetPeriod.daily,
        targetValue: 4,
        startDate: thirtyDaysAgo,
        sortOrder: 40,
      },
      reminder: everyDayReminder(timezone, '12:30'),
      buildLog(localDate) {
        const offset = dayDiff(thirtyDaysAgo, localDate)
        const value = [3, 4, 4, 5, 4, 3, 4][mod(offset, 7)]
        return {
          value,
          note: value >= 4 ? 'Meals were planned ahead.' : 'Missed the final snack.',
        }
      },
    },
    {
      title: 'No-Soda Days',
      data: {
        title: 'No-Soda Days',
        description: 'Stay off sugary soda for the day.',
        icon: 'takeoutbag.and.cup.and.straw.fill',
        colorScheme: 'lime',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.binary,
        targetPeriod: HabitTargetPeriod.daily,
        startDate: twentyOneDaysAgo,
        sortOrder: 50,
      },
      reminder: weekdayReminder(timezone, '13:00'),
      buildLog(localDate) {
        const offset = dayDiff(twentyOneDaysAgo, localDate)
        const completed = ![5, 12].includes(offset)
        return {
          completed,
          note: completed ? 'Stuck to sparkling water and coffee.' : 'Had soda during a social meal.',
        }
      },
    },
    {
      title: 'Weekly Strength Sessions',
      data: {
        title: 'Weekly Strength Sessions',
        description: 'Accumulate four lifting sessions per week.',
        icon: 'dumbbell.fill',
        colorScheme: 'iron',
        category: HabitCategory.training,
        trackingType: HabitTrackingType.count,
        targetPeriod: HabitTargetPeriod.weekly,
        targetValue: 4,
        startDate: sixtyDaysAgo,
        sortOrder: 60,
      },
      reminder: weekdayReminder(timezone, '18:00'),
      buildLog(localDate) {
        if (isWeekend(localDate)) {
          return null
        }

        const offset = dayDiff(sixtyDaysAgo, localDate)
        const value = [1, 1, 1, 1, 0][mod(offset, 5)]
        if (value === 0) {
          return null
        }

        return {
          value,
          note: 'Tracked a gym session toward the weekly target.',
        }
      },
    },
    {
      title: 'Home-Cooked Dinners',
      data: {
        title: 'Home-Cooked Dinners',
        description: 'Cook dinner at home at least five times each week.',
        icon: 'house.fill',
        colorScheme: 'terracotta',
        category: HabitCategory.nutrition,
        trackingType: HabitTrackingType.count,
        targetPeriod: HabitTargetPeriod.weekly,
        targetValue: 5,
        startDate: fortyFiveDaysAgo,
        sortOrder: 70,
      },
      reminder: weekdayReminder(timezone, '17:30'),
      buildLog(localDate) {
        const day = weekday(localDate)
        if (day === 2 || day === 4 || day === 5 || day === 6) {
          return {
            value: 1,
            note: 'Cooked at home instead of ordering in.',
          }
        }

        if (day === 0 && mod(dayDiff(fortyFiveDaysAgo, localDate), 2) === 0) {
          return {
            value: 1,
            note: 'Sunday meal prep counted toward the week.',
          }
        }

        return null
      },
    },
    {
      title: 'Long Walk Minutes',
      data: {
        title: 'Long Walk Minutes',
        description: 'Get 45 minutes of walking or easy cardio.',
        icon: 'figure.walk',
        colorScheme: 'forest',
        category: HabitCategory.lifestyle,
        trackingType: HabitTrackingType.duration,
        targetPeriod: HabitTargetPeriod.daily,
        targetValue: 45,
        unit: 'minutes',
        startDate: fourteenDaysAgo,
        endDate: addDays(today, 21),
        sortOrder: 80,
      },
      reminder: everyDayReminder(timezone, '19:15'),
      buildLog(localDate) {
        const offset = dayDiff(fourteenDaysAgo, localDate)
        const value = [35, 48, 52, 44, 60, 50, 42][mod(offset, 7)]
        return {
          value,
          note: value >= 45 ? 'Post-dinner walk completed.' : 'Shortened because of rain.',
        }
      },
    },
    {
      title: 'Monthly Massage Sessions',
      data: {
        title: 'Monthly Massage Sessions',
        description: 'Book two sports massage or recovery sessions each month.',
        icon: 'sparkles',
        colorScheme: 'sand',
        category: HabitCategory.recovery,
        trackingType: HabitTrackingType.count,
        targetPeriod: HabitTargetPeriod.monthly,
        targetValue: 2,
        startDate: ninetyDaysAgo,
        sortOrder: 90,
      },
      reminder: {
        time: '10:00',
        timezone,
        daysOfWeek: [1],
        isEnabled: true,
      },
      buildLog(localDate) {
        const day = Number(localDate.slice(8, 10))
        if (day === 5 || day === 19) {
          return {
            value: 1,
            note: 'Recovery appointment logged.',
          }
        }

        return null
      },
    },
    {
      title: 'Bodyweight Check-Ins',
      data: {
        title: 'Bodyweight Check-Ins',
        description: 'Log bodyweight on twelve mornings per month.',
        icon: 'scalemass.fill',
        colorScheme: 'slate',
        category: HabitCategory.bodyMetrics,
        trackingType: HabitTrackingType.count,
        targetPeriod: HabitTargetPeriod.monthly,
        targetValue: 12,
        startDate: ninetyDaysAgo,
        sortOrder: 100,
      },
      reminder: weekdayReminder(timezone, '07:00'),
      buildLog(localDate) {
        if (isWeekend(localDate)) {
          return null
        }

        const day = Number(localDate.slice(8, 10))
        if (day <= 18) {
          return {
            value: 1,
            note: 'Morning weigh-in captured.',
          }
        }

        return null
      },
    },
    {
      title: 'Sunrise Run Block',
      data: {
        title: 'Sunrise Run Block',
        description: 'Run before work three times per week for a six-week block.',
        icon: 'sun.max.fill',
        colorScheme: 'coral',
        category: HabitCategory.training,
        trackingType: HabitTrackingType.count,
        targetPeriod: HabitTargetPeriod.weekly,
        targetValue: 3,
        startDate: sevenDaysAgo,
        endDate: addDays(today, 35),
        sortOrder: 110,
      },
      reminder: {
        time: '06:00',
        timezone,
        daysOfWeek: [1, 3, 5],
        isEnabled: true,
      },
      buildLog(localDate) {
        if ([1, 3, 5].includes(weekday(localDate))) {
          return {
            value: 1,
            note: 'Easy aerobic run completed before work.',
          }
        }

        return null
      },
    },
  ]
}

function buildInternalSeeds(today: string): InternalHabitSeedDefinition[] {
  return [
    {
      title: 'Workout Logged',
      description: 'Automatically completed when a workout is logged.',
      icon: 'bolt.heart.fill',
      colorScheme: 'voltage',
      category: HabitCategory.training,
      internalMetric: 'workoutCompleted',
      startDate: subtractDays(today, 30),
      sortOrder: 200,
    },
    {
      title: 'Program Day Finished',
      description: 'Automatically completed when a scheduled program day is finished.',
      icon: 'checklist',
      colorScheme: 'sky',
      category: HabitCategory.training,
      internalMetric: 'programDayCompleted',
      startDate: subtractDays(today, 30),
      sortOrder: 210,
    },
    {
      title: 'Weight Logged',
      description: 'Automatically completed when a weight measurement is entered.',
      icon: 'scalemass',
      colorScheme: 'graphite',
      category: HabitCategory.bodyMetrics,
      internalMetric: 'weightLogged',
      startDate: subtractDays(today, 30),
      sortOrder: 220,
    },
  ]
}

async function seedManualHabits(app: FastifyInstance, user: Awaited<ReturnType<typeof resolveUser>>, days: number) {
  const today = getLocalDateKey(user.timezone)
  const logStart = subtractDays(today, Math.max(days - 1, 0))
  const seeds = buildManualSeeds(user.timezone, today)
  const dates = buildDateRange(logStart, today)
  const summary = {
    habits: 0,
    reminders: 0,
    logs: 0,
  }

  for (const seed of seeds) {
    const habit = await ensureManualHabit(app, user.id, seed)
    await clearSeededChildren(app, habit.id)

    if (seed.reminder) {
      await createHabitReminder(app, {
        userId: user.id,
        habitId: habit.id,
        data: seed.reminder,
      })
      summary.reminders += 1
    }

    for (const localDate of dates) {
      if (localDate < seed.data.startDate) {
        continue
      }

      if (seed.data.endDate && localDate > seed.data.endDate) {
        continue
      }

      const logData = seed.buildLog(localDate)
      if (!logData) {
        continue
      }

      await upsertHabitLog(app, {
        userId: user.id,
        habitId: habit.id,
        date: localDate,
        data: logData,
      })
      summary.logs += 1
    }

    summary.habits += 1
  }

  return summary
}

async function seedInternalHabits(app: FastifyInstance, userId: string, today: string) {
  const seeds = buildInternalSeeds(today)

  for (const seed of seeds) {
    const habit = await ensureInternalHabit(app, userId, seed)
    await clearSeededChildren(app, habit.id)
  }

  return backfillInternalHabitLogs(app, {
    userId,
    startDate: subtractDays(today, 30),
    endDate: today,
  })
}

const app = await buildApp()

try {
  const target = requireTargetUser()
  const includeInternal = hasFlag('include-internal')
  const days = Number(getArg('days') ?? '90')

  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    throw new Error('--days must be an integer between 1 and 365')
  }

  const user = await resolveUser(app, target)
  const manualSummary = await seedManualHabits(app, user, days)

  let internalSummary: Awaited<ReturnType<typeof seedInternalHabits>> | null = null
  if (includeInternal) {
    internalSummary = await seedInternalHabits(app, user.id, getLocalDateKey(user.timezone))
  }

  app.log.info({
    userId: user.id,
    email: user.email,
    timezone: user.timezone,
    weekStartsOn: user.weekStartsOn,
    manualSummary,
    internalSummary,
  }, 'Habit seed completed')
}
finally {
  await app.close()
}
