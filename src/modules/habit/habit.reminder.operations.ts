import type { FastifyInstance } from 'fastify'

const SCHEDULER_HEARTBEAT_KEY = 'habit-reminders:scheduler:last-execution'
const DEFAULT_HEALTH_THRESHOLD_MS = 5 * 60 * 1000
const HEARTBEAT_TTL_SECONDS = 24 * 60 * 60

export interface SchedulerExecutionResult {
  claimed?: number
  sent: number
  failed: number
  skipped: number
}

interface RecordSchedulerExecutionInput {
  status: 'success' | 'failed'
  startedAt: Date
  finishedAt: Date
  result?: SchedulerExecutionResult
  error?: unknown
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function recordHabitReminderSchedulerExecution(app: FastifyInstance, input: RecordSchedulerExecutionInput) {
  const payload = {
    status: input.status,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    result: input.result ?? null,
    error: input.error ? getErrorMessage(input.error) : null,
  }

  await app.redis.set(SCHEDULER_HEARTBEAT_KEY, JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS)
}

export async function getHabitReminderSchedulerHealth(app: FastifyInstance, input: {
  now?: Date
  thresholdMs?: number
} = {}) {
  const now = input.now ?? new Date()
  const thresholdMs = input.thresholdMs ?? DEFAULT_HEALTH_THRESHOLD_MS
  const raw = await app.redis.get(SCHEDULER_HEARTBEAT_KEY)

  if (!raw) {
    return {
      healthy: false,
      reason: 'No scheduler execution heartbeat found',
      lastExecution: null,
      thresholdMs,
    }
  }

  const lastExecution = JSON.parse(raw) as {
    status: 'success' | 'failed'
    startedAt: string
    finishedAt: string
    result: SchedulerExecutionResult | null
    error: string | null
  }
  const finishedAtMs = new Date(lastExecution.finishedAt).getTime()
  const ageMs = now.getTime() - finishedAtMs
  const healthy = lastExecution.status === 'success' && ageMs <= thresholdMs

  return {
    healthy,
    reason: healthy ? null : `Last successful scheduler execution is stale or failed (${ageMs}ms old)`,
    lastExecution,
    thresholdMs,
    ageMs,
  }
}
