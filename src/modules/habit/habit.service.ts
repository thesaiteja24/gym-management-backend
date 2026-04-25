import { PrismaClient, HabitSource } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())

export async function processHabitLogs(userId: string, startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate ? new Date(endDate) : new Date()

  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(23, 59, 59, 999)

  const habits = await prisma.habit.findMany({ where: { userId } })
  const manualLogs = await prisma.habitLog.findMany({
    where: { habit: { userId }, date: { gte: start, lte: end } },
  })

  const logsMap: Record<string, any[]> = {}
  habits.forEach((h) => {
    logsMap[h.id] = []
  })

  manualLogs.forEach((log) => {
    if (logsMap[log.habitId])
      logsMap[log.habitId].push({ date: log.date, value: Number(log.value) })
  })

  const internalHabits = habits.filter((h) => h.source === HabitSource.internal)
  if (internalHabits.length > 0) {
    const metrics = internalHabits.map((h) => h.internalMetricId)
    const needsMeasurements = metrics.some((m) => ['weight', 'bodyFat', 'waist'].includes(m || ''))
    const needsWorkouts = metrics.includes('workout')

    const [measurements, workouts] = await Promise.all([
      needsMeasurements
        ? prisma.userMeasurement.findMany({
            where: { userId, date: { gte: start, lte: end } },
            select: { date: true, weight: true, bodyFat: true, waist: true },
          })
        : Promise.resolve([]),
      needsWorkouts
        ? prisma.workoutLog.findMany({
            where: { userId, startTime: { gte: start, lte: end }, deletedAt: null },
            select: { startTime: true },
          })
        : Promise.resolve([]),
    ])

    internalHabits.forEach((h) => {
      const metric = h.internalMetricId
      if (metric === 'workout') {
        const counts: Record<string, number> = {}
        workouts.forEach((w) => {
          if (w.startTime) {
            const ds = new Date(w.startTime).toISOString().split('T')[0]
            counts[ds] = (counts[ds] || 0) + 1
          }
        })
        Object.entries(counts).forEach(([ds, val]) =>
          logsMap[h.id].push({ date: new Date(ds), value: val }),
        )
      } else if (['weight', 'bodyFat', 'waist'].includes(metric || '')) {
        measurements.forEach((m) => {
          if (
            (metric === 'weight' && m.weight !== null) ||
            (metric === 'bodyFat' && m.bodyFat !== null) ||
            (metric === 'waist' && m.waist !== null)
          ) {
            logsMap[h.id].push({ date: m.date, value: 1 })
          }
        })
      }
    })
  }

  return logsMap
}
