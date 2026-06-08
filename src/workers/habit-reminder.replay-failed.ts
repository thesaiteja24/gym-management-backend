import { buildApp } from '@/app'
import { replayFailedHabitReminderDeliveries } from '@/modules/habit/habit.reminder.dispatcher'

function getNumberArg(name: string) {
  const prefix = `--${name}=`
  const value = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
  return value ? Number(value) : undefined
}

async function main() {
  const app = await buildApp()

  try {
    const result = await replayFailedHabitReminderDeliveries(app, {
      batchSize: getNumberArg('batch-size'),
    })

    app.log.info(result, 'Habit reminder failed delivery replay completed')
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
