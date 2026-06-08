import type { FastifyInstance } from 'fastify'
import type { HabitReminderPushClient } from '@/services/onesignal.service'
import { HabitReminderDeliveryStatus, Prisma } from '@prisma/client'
import { OneSignalError, OneSignalService } from '@/services/onesignal.service'
import { calculateNextReminderTrigger } from './habit.reminder.service'

const MAX_ATTEMPTS = 3
const STALE_DELIVERY_MS = 5 * 60 * 1000

interface ClaimedReminder {
  id: string
  time: string
  timezone: string
  daysOfWeek: number[]
  nextTriggerAt: Date
}

interface DispatchHabitRemindersInput {
  now?: Date
  batchSize?: number
  pushClient?: HabitReminderPushClient
}

interface ReplayFailedHabitRemindersInput {
  now?: Date
  batchSize?: number
  pushClient?: HabitReminderPushClient
}

interface DeliveryToSend {
  id: string
  scheduledAt: Date
  attempts: number
  reminder: {
    isEnabled: boolean
    habit: {
      title: string
      userId: string
      isActive: boolean
      startDate: Date
      endDate: Date | null
    }
  }
}

function toDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function getLastError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableError(error: unknown) {
  return error instanceof OneSignalError ? error.retryable : true
}

async function claimDueReminders(app: FastifyInstance, now: Date, batchSize: number) {
  return app.prisma.$transaction(async (tx) => {
    const reminders = await tx.$queryRaw<ClaimedReminder[]>(Prisma.sql`
      SELECT
        r.id,
        r.time,
        r.timezone,
        r."daysOfWeek",
        r."nextTriggerAt"
      FROM "HabitReminder" r
      INNER JOIN "Habit" h ON h.id = r."habitId"
      WHERE r."isEnabled" = true
        AND r."nextTriggerAt" IS NOT NULL
        AND r."nextTriggerAt" <= ${now}
        AND h."isActive" = true
        AND h."startDate" <= ${toDateOnly(now)}
        AND (h."endDate" IS NULL OR h."endDate" >= ${toDateOnly(now)})
      ORDER BY r."nextTriggerAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `)

    for (const reminder of reminders) {
      await tx.habitReminderDelivery.createMany({
        data: [{
          reminderId: reminder.id,
          scheduledAt: reminder.nextTriggerAt,
        }],
        skipDuplicates: true,
      })

      await tx.habitReminder.update({
        where: { id: reminder.id },
        data: {
          nextTriggerAt: calculateNextReminderTrigger({
            time: reminder.time,
            timezone: reminder.timezone,
            daysOfWeek: reminder.daysOfWeek,
            now: reminder.nextTriggerAt,
          }),
        },
      })
    }

    return reminders.length
  })
}

async function getPendingDeliveries(app: FastifyInstance, now: Date, batchSize: number) {
  return app.prisma.habitReminderDelivery.findMany({
    where: {
      scheduledAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: HabitReminderDeliveryStatus.pending },
        { status: HabitReminderDeliveryStatus.failed },
      ],
    },
    orderBy: [
      { scheduledAt: 'asc' },
      { createdAt: 'asc' },
    ],
    take: batchSize,
    include: {
      reminder: {
        include: {
          habit: true,
        },
      },
    },
  }) as Promise<DeliveryToSend[]>
}

async function getRetryableFailedDeliveries(app: FastifyInstance, batchSize: number) {
  return app.prisma.habitReminderDelivery.findMany({
    where: {
      status: HabitReminderDeliveryStatus.failed,
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: [
      { scheduledAt: 'asc' },
      { createdAt: 'asc' },
    ],
    take: batchSize,
    include: {
      reminder: {
        include: {
          habit: true,
        },
      },
    },
  }) as Promise<DeliveryToSend[]>
}

function shouldSkipDelivery(delivery: DeliveryToSend, now: Date) {
  if (!delivery.reminder.isEnabled || !delivery.reminder.habit.isActive) {
    return true
  }

  const today = toDateOnly(now)
  const { startDate, endDate } = delivery.reminder.habit
  if (startDate > today || (endDate && endDate < today)) {
    return true
  }

  return delivery.attempts === 0 && now.getTime() - delivery.scheduledAt.getTime() > STALE_DELIVERY_MS
}

async function markSkipped(app: FastifyInstance, deliveryId: string, reason: string) {
  await app.prisma.habitReminderDelivery.update({
    where: { id: deliveryId },
    data: {
      status: HabitReminderDeliveryStatus.skipped,
      lastError: reason,
    },
  })
}

async function markSent(app: FastifyInstance, deliveryId: string, providerId?: string) {
  await app.prisma.habitReminderDelivery.update({
    where: { id: deliveryId },
    data: {
      status: HabitReminderDeliveryStatus.sent,
      attempts: { increment: 1 },
      sentAt: new Date(),
      providerId,
      lastError: null,
    },
  })
}

async function markFailed(app: FastifyInstance, delivery: DeliveryToSend, error: unknown) {
  const retryable = isRetryableError(error)
  await app.prisma.habitReminderDelivery.update({
    where: { id: delivery.id },
    data: {
      status: HabitReminderDeliveryStatus.failed,
      attempts: { increment: 1 },
      lastError: getLastError(error),
      ...(retryable ? {} : { attempts: MAX_ATTEMPTS }),
    },
  })
}

async function sendDelivery(app: FastifyInstance, delivery: DeliveryToSend, pushClient: HabitReminderPushClient, now: Date) {
  if (shouldSkipDelivery(delivery, now)) {
    await markSkipped(app, delivery.id, 'Delivery is stale or no longer eligible')
    return 'skipped'
  }

  try {
    const result = await pushClient.sendHabitReminder({
      deliveryId: delivery.id,
      userId: delivery.reminder.habit.userId,
      habitTitle: delivery.reminder.habit.title,
    })
    await markSent(app, delivery.id, result.providerId)
    return 'sent'
  }
  catch (error) {
    await markFailed(app, delivery, error)
    return 'failed'
  }
}

export async function dispatchHabitReminders(app: FastifyInstance, input: DispatchHabitRemindersInput = {}) {
  const now = input.now ?? new Date()
  const batchSize = input.batchSize ?? 100
  const pushClient = input.pushClient ?? new OneSignalService(app.config)
  const claimed = await claimDueReminders(app, now, batchSize)
  const deliveries = await getPendingDeliveries(app, now, batchSize)
  const result = {
    claimed,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  for (const delivery of deliveries) {
    const status = await sendDelivery(app, delivery, pushClient, now)
    result[status] += 1
  }

  return result
}

export async function replayFailedHabitReminderDeliveries(app: FastifyInstance, input: ReplayFailedHabitRemindersInput = {}) {
  const now = input.now ?? new Date()
  const batchSize = input.batchSize ?? 100
  const pushClient = input.pushClient ?? new OneSignalService(app.config)
  const deliveries = await getRetryableFailedDeliveries(app, batchSize)
  const result = {
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  for (const delivery of deliveries) {
    const status = await sendDelivery(app, delivery, pushClient, now)
    result[status] += 1
  }

  return result
}
