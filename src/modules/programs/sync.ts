import { prisma } from '../../lib/prisma.js'
import {
  deleteCache,
  invalidateCachePattern,
  redisClient,
} from '../../service/caching.service.js'



const getDateStr = () => new Date().toISOString().split('T')[0]
const getActiveUserProgramCacheKey = (userId: string) =>
  `programs:user:active:${userId}:${getDateStr()}`
const getUserProgramListCacheKey = (userId: string) =>
  `programs:user:list:${userId}:${getDateStr()}`

/**
 * Public helper to invalidate all program caches for a specific user.
 */
export async function invalidateUserProgramCache(userId: string, userProgramId?: string) {
  const stream = redisClient.scanStream({
    match: `programs:user:*:${userId}:*`,
  })
  for await (const keys of stream) {
    if (keys.length > 0) await redisClient.del(...keys)
  }

  if (userProgramId) {
    await invalidateCachePattern(`programs:user:id:${userProgramId}:*`)
  }
}

/**
 * Instantiates a specific week for a user program by taking snapshots of the base templates.
 */
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

/**
 * Automatically completes rest days if the scheduled time has passed.
 */
function getDayStartUTC(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

async function handleRestDayAutoCompletion(userProgram: any) {
  let { currentWeek: cWeek, currentDay: cDay } = userProgram.progress
  let advanced = false

  const prevDay = await prisma.userProgramDay.findFirst({
    where: {
      dayIndex: cDay === 0 ? 6 : cDay - 1,
      week: { userProgramId: userProgram.id, weekIndex: cDay === 0 ? cWeek - 1 : cWeek },
    },
    select: { completedAt: true },
  })
  let lastActivity = prevDay?.completedAt || new Date(userProgram.startDate)

  while (cWeek < userProgram.durationWeeks) {
    const todayUTC = getDayStartUTC(new Date())
    const scheduledUTC = getDayStartUTC(lastActivity) + 86400000
    if (scheduledUTC >= todayUTC) break

    const day = await prisma.userProgramDay.findFirst({
      where: { dayIndex: cDay, week: { userProgramId: userProgram.id, weekIndex: cWeek } },
    })

    if (!day?.isRestDay || day.completed) break

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
  }

  return { advanced, cWeek, cDay }
}

/**
 * Fetches and attaches the current day's template snapshot to the user program.
 */
async function populateCurrentDayData(userProgram: any) {
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
}

/**
 * Synchronizes user program progress and populates current day data.
 */
export async function syncAndPopulateUserProgram(userProgram: any) {
  if (!userProgram?.progress) return userProgram

  const { advanced, cWeek, cDay } = await handleRestDayAutoCompletion(userProgram)

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

    await Promise.all([
      deleteCache(getActiveUserProgramCacheKey(userProgram.userId)),
      deleteCache(getUserProgramListCacheKey(userProgram.userId)),
      invalidateCachePattern(`programs:user:id:${userProgram.id}:*`),
    ])
  }

  await populateCurrentDayData(userProgram)

  return userProgram
}
