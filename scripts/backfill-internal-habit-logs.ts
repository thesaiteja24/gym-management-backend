import { InternalHabitMetric } from '@prisma/client'
import { buildApp } from '../src/app'
import { backfillInternalHabitLogs } from '../src/modules/habit/habit.internal.backfill.service'

function getArg(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function parseMetrics(value?: string) {
  if (!value) {
    return undefined
  }

  const metrics = value.split(',').map(metric => metric.trim()).filter(Boolean)
  const validMetrics = new Set(Object.values(InternalHabitMetric))

  for (const metric of metrics) {
    if (!validMetrics.has(metric as InternalHabitMetric)) {
      throw new Error(`Invalid metric: ${metric}`)
    }
  }

  return metrics as InternalHabitMetric[]
}

const app = await buildApp()

try {
  const result = await backfillInternalHabitLogs(app, {
    userId: getArg('user-id'),
    metrics: parseMetrics(getArg('metrics')),
    startDate: getArg('start-date'),
    endDate: getArg('end-date'),
  })

  app.log.info(result, 'Internal habit log backfill completed')
}
finally {
  await app.close()
}
