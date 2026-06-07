import type { FastifyInstance } from 'fastify'
import type {
  HabitReminderCreateInput,
  HabitReminderUpdateInput,
} from './habit.schema'
import { HttpError } from '@/utils/response'
import { getHabit } from './habit.service'

const reminderSelect = {
  id: true,
  habitId: true,
  time: true,
  timezone: true,
  daysOfWeek: true,
  nextTriggerAt: true,
  isEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const

interface TimeZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseLocalDate(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number)
  if (!year || !month || !day) {
    throw new Error(`Invalid local date: ${localDate}`)
  }

  return { year, month, day }
}

function parseReminderTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  if (hour === undefined || minute === undefined) {
    throw new Error(`Invalid reminder time: ${time}`)
  }

  return { hour, minute }
}

function getTimeZoneParts(timezone: string, date: Date): TimeZoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function toLocalDateKey(parts: Pick<TimeZoneParts, 'year' | 'month' | 'day'>) {
  return [
    parts.year.toString().padStart(4, '0'),
    parts.month.toString().padStart(2, '0'),
    parts.day.toString().padStart(2, '0'),
  ].join('-')
}

function addLocalDays(localDate: string, days: number) {
  const { year, month, day } = parseLocalDate(localDate)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function getWeekdayForLocalDate(localDate: string) {
  const { year, month, day } = parseLocalDate(localDate)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function getUtcInstantForLocalTime(timezone: string, localDate: string, time: string) {
  const { year, month, day } = parseLocalDate(localDate)
  const { hour, minute } = parseReminderTime(time)
  const expectedUtc = Date.UTC(year, month - 1, day, hour, minute)
  let utcMs = expectedUtc

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getTimeZoneParts(timezone, new Date(utcMs))
    const actualUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    utcMs -= actualUtc - expectedUtc
  }

  return new Date(utcMs)
}

export function calculateNextReminderTrigger(input: {
  time: string
  timezone: string
  daysOfWeek: number[]
  now?: Date
}) {
  const now = input.now ?? new Date()
  const nowParts = getTimeZoneParts(input.timezone, now)
  const today = toLocalDateKey(nowParts)
  const reminderTime = parseReminderTime(input.time)
  const currentMinuteOfDay = nowParts.hour * 60 + nowParts.minute
  const reminderMinuteOfDay = reminderTime.hour * 60 + reminderTime.minute
  const enabledDays = new Set(input.daysOfWeek)

  for (let offset = 0; offset <= 7; offset += 1) {
    const localDate = addLocalDays(today, offset)
    if (!enabledDays.has(getWeekdayForLocalDate(localDate))) {
      continue
    }

    if (offset === 0 && reminderMinuteOfDay <= currentMinuteOfDay) {
      continue
    }

    return getUtcInstantForLocalTime(input.timezone, localDate, input.time)
  }

  return getUtcInstantForLocalTime(input.timezone, addLocalDays(today, 7), input.time)
}

function normalizeDaysOfWeek(daysOfWeek: number[]) {
  return [...daysOfWeek].sort((a, b) => a - b)
}

async function getUserTimezone(app: FastifyInstance, userId: string) {
  const user = await app.prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })

  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', 'User not found')
  }

  return user.timezone
}

async function getReminderForUser(app: FastifyInstance, input: {
  userId: string
  habitId: string
  reminderId: string
}) {
  const reminder = await app.prisma.habitReminder.findFirst({
    where: {
      id: input.reminderId,
      habitId: input.habitId,
      habit: {
        userId: input.userId,
      },
    },
    select: reminderSelect,
  })

  if (!reminder) {
    throw new HttpError(404, 'NOT_FOUND', 'Reminder not found')
  }

  return reminder
}

export async function listHabitReminders(app: FastifyInstance, input: {
  userId: string
  habitId: string
}) {
  await getHabit(app, input.userId, input.habitId)

  return app.prisma.habitReminder.findMany({
    where: {
      habitId: input.habitId,
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: reminderSelect,
  })
}

export async function getHabitReminder(app: FastifyInstance, input: {
  userId: string
  habitId: string
  reminderId: string
}) {
  return getReminderForUser(app, input)
}

export async function createHabitReminder(app: FastifyInstance, input: {
  userId: string
  habitId: string
  data: HabitReminderCreateInput
}) {
  const habit = await getHabit(app, input.userId, input.habitId)
  if (!habit.isActive) {
    throw new HttpError(400, 'INACTIVE_HABIT', 'Cannot create reminders for an inactive habit')
  }

  const timezone = input.data.timezone ?? await getUserTimezone(app, input.userId)
  const daysOfWeek = normalizeDaysOfWeek(input.data.daysOfWeek)
  const nextTriggerAt = input.data.isEnabled
    ? calculateNextReminderTrigger({ time: input.data.time, timezone, daysOfWeek })
    : null

  return app.prisma.habitReminder.create({
    data: {
      habitId: input.habitId,
      time: input.data.time,
      timezone,
      daysOfWeek,
      isEnabled: input.data.isEnabled,
      nextTriggerAt,
    },
    select: reminderSelect,
  })
}

export async function updateHabitReminder(app: FastifyInstance, input: {
  userId: string
  habitId: string
  reminderId: string
  data: HabitReminderUpdateInput
}) {
  const current = await getReminderForUser(app, input)
  const time = input.data.time ?? current.time
  const timezone = input.data.timezone ?? current.timezone
  const daysOfWeek = input.data.daysOfWeek ? normalizeDaysOfWeek(input.data.daysOfWeek) : current.daysOfWeek
  const isEnabled = input.data.isEnabled ?? current.isEnabled
  const nextTriggerAt = isEnabled
    ? calculateNextReminderTrigger({ time, timezone, daysOfWeek })
    : null

  return app.prisma.habitReminder.update({
    where: { id: input.reminderId },
    data: {
      time: input.data.time,
      timezone: input.data.timezone,
      daysOfWeek: input.data.daysOfWeek ? daysOfWeek : undefined,
      isEnabled: input.data.isEnabled,
      nextTriggerAt,
    },
    select: reminderSelect,
  })
}

export async function deleteHabitReminder(app: FastifyInstance, input: {
  userId: string
  habitId: string
  reminderId: string
}) {
  const reminder = await getReminderForUser(app, input)

  await app.prisma.habitReminder.delete({
    where: { id: input.reminderId },
  })

  return reminder
}
