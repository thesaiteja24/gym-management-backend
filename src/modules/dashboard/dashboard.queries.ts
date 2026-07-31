import type { FastifyInstance } from 'fastify'

export async function getDashboardActivityDates(app: FastifyInstance, input: {
  userId: string
  start: Date
  end: Date
}) {
  const [habitLogs, workouts] = await Promise.all([
    app.prisma.habitLog.findMany({
      where: {
        completed: true,
        date: { gte: input.start, lte: input.end },
        habit: { userId: input.userId },
      },
      select: { date: true },
    }),
    app.prisma.workoutLog.findMany({
      where: {
        userId: input.userId,
        deletedAt: null,
        startTime: { gte: input.start, lte: input.end },
      },
      select: { startTime: true },
    }),
  ])

  return { habitLogs, workouts }
}

export async function getDashboardDatePreferences(app: FastifyInstance, userId: string) {
  return app.prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, weekStartsOn: true },
  })
}

export async function getDashboardHabits(app: FastifyInstance, input: {
  userId: string
  today: Date
  logStartDate: Date
}) {
  const habits = await app.prisma.habit.findMany({
    where: {
      userId: input.userId,
      isActive: true,
      startDate: { lte: input.today },
      OR: [
        { endDate: null },
        { endDate: { gte: input.today } },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      title: true,
      icon: true,
      colorScheme: true,
      category: true,
      trackingType: true,
      targetPeriod: true,
      targetValue: true,
      unit: true,
      source: true,
      startDate: true,
      endDate: true,
    },
  })

  const logs = habits.length === 0
    ? []
    : await app.prisma.habitLog.findMany({
        where: {
          habitId: { in: habits.map(habit => habit.id) },
          date: { gte: input.logStartDate, lte: input.today },
        },
        select: {
          habitId: true,
          date: true,
          value: true,
          completed: true,
        },
      })

  return { habits, logs }
}
