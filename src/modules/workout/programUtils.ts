import type { Prisma } from '@prisma/client'

/**
 * Advances program progress if the workout is linked to a user program.
 */
export async function advanceProgramProgress(
  tx: Prisma.TransactionClient,
  userProgramDayId: string,
  workoutId: string,
) {
  const day = await tx.userProgramDay.findUnique({
    where: { id: userProgramDayId },
    include: {
      week: {
        include: {
          userProgram: {
            include: { progress: true },
          },
        },
      },
    },
  })

  if (!day || day.completed) return

  const userProgram = day.week.userProgram
  const progress = userProgram.progress

  if (
    progress &&
    progress.currentWeek === day.week.weekIndex &&
    progress.currentDay === day.dayIndex
  ) {
    // Mark day as completed
    await tx.userProgramDay.update({
      where: { id: userProgramDayId },
      data: {
        completed: true,
        completedAt: new Date(),
        workoutLogId: workoutId,
      },
    })

    // Advance progress
    let nextDay = progress.currentDay + 1
    let nextWeek = progress.currentWeek

    if (nextDay >= 7) {
      nextDay = 0
      nextWeek++
    }

    if (nextWeek < userProgram.durationWeeks) {
      await tx.userProgramProgress.update({
        where: { id: progress.id },
        data: { currentDay: nextDay, currentWeek: nextWeek },
      })
    } else {
      await tx.userProgram.update({
        where: { id: userProgram.id },
        data: { status: 'completed' },
      })
    }
  }
}
