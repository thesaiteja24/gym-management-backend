import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())

export async function instantiateUserWeek(
  tx: any,
  userProgramId: string,
  program: any,
  weekIndex: number,
) {
  const baseWeeks = program.weeks
  const totalBaseWeeks = baseWeeks.length
  const baseWeek = baseWeeks[weekIndex % totalBaseWeeks]

  const userWeek = await tx.userProgramWeek.create({
    data: { userProgramId, weekIndex },
  })

  for (const day of baseWeek.days) {
    let snapShotId: string | null = null
    if (!day.isRestDay && day.template) {
      const snapshot = await tx.workoutTemplateSnapshot.create({
        data: {
          originalTemplateId: day.templateId,
          title: day.template.title,
          notes: day.template.notes,
          exercises: {
            exerciseGroups: day.template.exerciseGroups,
            exercises: day.template.exercises,
          },
        },
      })
      snapShotId = snapshot.id
    }
    await tx.userProgramDay.create({
      data: {
        userProgramWeekId: userWeek.id,
        name: day.name,
        dayIndex: day.dayIndex,
        isRestDay: day.isRestDay,
        templateSnapshotId: snapShotId,
      },
    })
  }
  return userWeek
}

export function formatUserProgram(userProgram: any) {
  if (!userProgram) return null
  const formattedWeeks = userProgram.weeks?.map((week: any) => ({
    ...week,
    days: week.days?.map((day: any) => {
      if (day.templateSnapshot?.exercises) {
        const { exercises = [], exerciseGroups = [] } = day.templateSnapshot.exercises
        return { ...day, templateSnapshot: { ...day.templateSnapshot, exercises, exerciseGroups } }
      }
      return day
    }),
  }))

  const progress = userProgram.progress
  if (progress?.templateSnapshot?.exercises) {
    const { exercises = [], exerciseGroups = [] } = progress.templateSnapshot.exercises
    progress.templateSnapshot = { ...progress.templateSnapshot, exercises, exerciseGroups }
  }

  return { ...userProgram, weeks: formattedWeeks, progress }
}

export async function syncAndPopulateUserProgram(userProgram: any) {
  if (!userProgram?.progress) return userProgram
  const { currentWeek, currentDay } = userProgram.progress
  let advanced = false,
    cWeek = currentWeek,
    cDay = currentDay

  // Find last activity
  const prevDay = await prisma.userProgramDay.findFirst({
    where: {
      dayIndex: cDay === 0 ? 6 : cDay - 1,
      week: { userProgramId: userProgram.id, weekIndex: cDay === 0 ? cWeek - 1 : cWeek },
    },
    select: { completedAt: true },
  })
  let lastActivity = prevDay?.completedAt || new Date(userProgram.startDate)

  while (true) {
    const todayUTC = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    )
    const scheduledUTC =
      Date.UTC(
        lastActivity.getUTCFullYear(),
        lastActivity.getUTCMonth(),
        lastActivity.getUTCDate(),
      ) + 86400000
    if (scheduledUTC >= todayUTC) break

    const day = await prisma.userProgramDay.findFirst({
      where: { dayIndex: cDay, week: { userProgramId: userProgram.id, weekIndex: cWeek } },
    })
    if (day?.isRestDay && !day.completed) {
      await prisma.userProgramDay.update({
        where: { id: day.id },
        data: { completed: true, completedAt: new Date() },
      })
      lastActivity = new Date()
      cDay++
      if (cDay >= 7) {
        cDay = 0
        cWeek++
      }
      advanced = true
      if (cWeek >= userProgram.durationWeeks) break
    } else break
  }

  if (advanced) {
    if (cWeek < userProgram.durationWeeks) {
      await prisma.userProgramProgress.update({
        where: { id: userProgram.progress.id },
        data: { currentWeek: cWeek, currentDay: cDay },
      })
      userProgram.progress.currentWeek = cWeek
      userProgram.progress.currentDay = cDay
    } else {
      await prisma.userProgram.update({
        where: { id: userProgram.id },
        data: { status: 'completed' },
      })
      userProgram.status = 'completed'
    }
  }

  const currentDayData = await prisma.userProgramDay.findFirst({
    where: {
      dayIndex: userProgram.progress.currentDay,
      week: { userProgramId: userProgram.id, weekIndex: userProgram.progress.currentWeek },
    },
    include: { templateSnapshot: true },
  })
  if (currentDayData) {
    userProgram.progress = {
      ...userProgram.progress,
      userProgramDayId: currentDayData.id,
      workoutTitle: currentDayData.templateSnapshot?.title || null,
      isRestDay: currentDayData.isRestDay,
      templateSnapshot: currentDayData.templateSnapshot,
    }
  }
  return userProgram
}
