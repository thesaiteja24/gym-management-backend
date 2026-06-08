import { buildApp } from '@/app'
import { getHabitReminderSchedulerHealth } from '@/modules/habit/habit.reminder.operations'

function getNumberArg(name: string) {
  const prefix = `--${name}=`
  const value = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
  return value ? Number(value) : undefined
}

async function main() {
  const app = await buildApp()

  try {
    const health = await getHabitReminderSchedulerHealth(app, {
      thresholdMs: getNumberArg('threshold-ms'),
    })

    if (!health.healthy) {
      app.log.error(health, 'Habit reminder scheduler health check failed')
      process.exitCode = 1
      return
    }

    app.log.info(health, 'Habit reminder scheduler health check passed')
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
