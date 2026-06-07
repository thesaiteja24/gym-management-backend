import { buildApp } from '@/app'
import { dispatchHabitReminders } from '@/modules/habit/habit.reminder.dispatcher'
import { recordHabitReminderSchedulerExecution } from '@/modules/habit/habit.reminder.operations'

async function main() {
  const app = await buildApp()
  const startedAt = new Date()

  try {
    const result = await dispatchHabitReminders(app)
    await recordHabitReminderSchedulerExecution(app, {
      status: 'success',
      startedAt,
      finishedAt: new Date(),
      result,
    })
    app.log.info(result, 'Habit reminder dispatch completed')
  }
  catch (error) {
    await recordHabitReminderSchedulerExecution(app, {
      status: 'failed',
      startedAt,
      finishedAt: new Date(),
      error,
    })
    app.log.error({ error }, 'Habit reminder dispatch failed')
    throw error
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
