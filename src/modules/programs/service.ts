import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { ApiError } from '../../utils/ApiError.js'
import { formatCompactNumber } from '../../utils/helpers.js'
import type {
  CreateProgramBody,
  ProgramResponse,
  UpdateProgramBody,
  UserProgramResponse,
} from './types.js'

// SECTION: CONFIG

const prisma = new PrismaClient().$extends(withAccelerate())

const standardProgramSelect = {
  id: true,
  title: true,
  description: true,
  experienceLevel: true,
  createdBy: true,
}

// SECTION: CONSTANTS

const GET_ALL_PROGRAMS_CACHE = 'programs:all'
const ALL_PROGRAMS_CACHE_TTL = '365d'

// SECTION: FORMATTERS

/**
 * Formats a user program for the frontend, ensuring exercises and groups are properly nested.
 */
export function formatUserProgram(userProgram: any): UserProgramResponse {
  if (!userProgram) return null as any

  const formattedWeeks = userProgram.weeks?.map((week: any) => ({
    ...week,
    days: week.days?.map((day: any) => {
      if (day.templateSnapshot?.exercises) {
        const { exercises = [], exerciseGroups = [] } = day.templateSnapshot.exercises
        return {
          ...day,
          templateSnapshot: { ...day.templateSnapshot, exercises, exerciseGroups },
        }
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

// SECTION: PROGRAM SERVICES

/**
 * Fetches all programs with pagination.
 */
export async function getAllPrograms(page: number, limit: number) {
  const skip = (page - 1) * limit

  const [programs, total] = await Promise.all([
    prisma.program.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { userPrograms: true } } },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.program.count({ where: { deletedAt: null } }),
  ])

  const results = programs.map((p) => ({
    ...p,
    enrolledCount: p._count.userPrograms,
    enrolledCountLabel: formatCompactNumber(p._count.userPrograms),
  }))

  return { programs: results, pagination: { total, page, limit, pages: Math.ceil(total / limit) } }
}

/**
 * Fetches a single program by ID with full week/day details.
 */
export async function getProgramById(programId: string): Promise<ProgramResponse> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      weeks: {
        orderBy: { weekIndex: 'asc' },
        include: {
          days: {
            orderBy: { dayIndex: 'asc' },
            include: {
              template: {
                include: {
                  exerciseGroups: true,
                  exercises: { include: { sets: true, exercise: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!program) throw new ApiError(404, 'Program not found')
  return program as any
}

/**
 * Creates a new program.
 */
export async function createProgram(userId: string, body: CreateProgramBody) {
  const { clientId, title, description, experienceLevel, durationOptions, weeks } = body

  // Check templates
  const templateIds = [
    ...new Set(
      weeks
        .flatMap((w) => w.days)
        .map((d) => d.templateId)
        .filter(Boolean),
    ),
  ]

  if (templateIds.length) {
    const found = await prisma.workoutTemplate.count({
      where: { id: { in: templateIds as string[] }, deletedAt: null, userId },
    })
    if (found !== templateIds.length) {
      throw new ApiError(404, 'Some templates are invalid or unauthorized')
    }
  }

  return prisma.program.create({
    data: {
      clientId,
      title,
      description,
      experienceLevel,
      durationOptions,
      createdBy: userId,
      weeks: {
        create: weeks.map((w) => ({
          name: w.name.trim(),
          weekIndex: w.weekIndex,
          days: {
            create: w.days.map((d) => ({
              name: d.name.trim(),
              dayIndex: d.dayIndex,
              isRestDay: d.isRestDay,
              templateId: d.isRestDay ? null : d.templateId,
            })),
          },
        })),
      },
    },
  })
}

/**
 * Updates an existing program.
 */
export async function updateProgram(programId: string, userId: string, body: UpdateProgramBody) {
  const { title, description, experienceLevel, durationOptions, weeks } = body

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, createdBy: true },
  })

  if (!program || program.createdBy !== userId) {
    throw new ApiError(403, 'Unauthorized')
  }

  return prisma.$transaction(async (tx) => {
    await tx.program.update({
      where: { id: programId },
      data: { title, description, experienceLevel, durationOptions },
    })

    if (weeks) {
      await tx.programWeek.deleteMany({ where: { programId } })
      for (const w of weeks) {
        await tx.programWeek.create({
          data: {
            programId,
            name: w.name.trim(),
            weekIndex: w.weekIndex,
            days: {
              create: w.days.map((d) => ({
                name: d.name.trim(),
                dayIndex: d.dayIndex,
                isRestDay: d.isRestDay,
                templateId: d.isRestDay ? null : d.templateId,
              })),
            },
          },
        })
      }
    }

    return tx.program.findUnique({
      where: { id: programId },
      include: { weeks: { include: { days: { include: { template: true } } } } },
    })
  })
}

/**
 * Soft deletes a program.
 */
export async function deleteProgram(programId: string, userId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { createdBy: true },
  })

  if (!program) throw new ApiError(404, 'Program not found')
  if (program.createdBy !== userId) throw new ApiError(403, 'Unauthorized')

  await prisma.program.update({
    where: { id: programId },
    data: { deletedAt: new Date() },
  })
}

// SECTION: USER PROGRAM SERVICES

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
 * Synchronizes user program progress and populates current day data.
 */
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

/**
 * Starts a program for a user.
 */
export async function startProgram(
  userId: string,
  programId: string,
  duration: number,
  startDate?: Date,
): Promise<UserProgramResponse> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { weeks: { include: { days: { include: { template: true } } } } },
  })

  if (!program) throw new ApiError(404, 'Program not found')

  const result = await prisma.$transaction(async (tx) => {
    await tx.userProgram.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'paused' },
    })

    const userProgram = await tx.userProgram.create({
      data: {
        userId,
        programId,
        durationWeeks: duration,
        startDate: startDate ?? new Date(),
        status: 'active',
      },
    })

    await instantiateUserWeek(tx, userProgram.id, program, 0)

    await tx.userProgramProgress.create({
      data: { userProgramId: userProgram.id, currentWeek: 0, currentDay: 0 },
    })

    return tx.userProgram.findUnique({
      where: { id: userProgram.id },
      include: {
        weeks: { include: { days: { include: { templateSnapshot: true } } } },
        program: { select: standardProgramSelect },
        progress: true,
      },
    })
  })

  return formatUserProgram(result)
}

/**
 * Fetches a user program by ID, instantiating the requested week if it doesn't exist.
 */
export async function getUserProgramById(
  userId: string,
  userProgramId: string,
  requestedWeek: number,
): Promise<UserProgramResponse> {
  let up = await prisma.userProgram.findUnique({
    where: { id: userProgramId },
    include: {
      weeks: {
        where: { weekIndex: requestedWeek },
        include: { days: { include: { templateSnapshot: true } } },
      },
      program: { select: standardProgramSelect },
      progress: true,
    },
  })

  if (!up || up.userId !== userId) throw new ApiError(404, 'Program not found')

  if (up.weeks.length === 0 && requestedWeek < up.durationWeeks) {
    const base = await prisma.program.findUnique({
      where: { id: up.programId },
      include: { weeks: { include: { days: { include: { template: true } } } } },
    })

    if (base) {
      await prisma.$transaction(
        async (tx) => {
          await instantiateUserWeek(tx, userProgramId, base, requestedWeek)
        },
        { timeout: 10000 },
      )

      up = await prisma.userProgram.findUnique({
        where: { id: userProgramId },
        include: {
          weeks: {
            where: { weekIndex: requestedWeek },
            include: { days: { include: { templateSnapshot: true } } },
          },
          program: { select: standardProgramSelect },
          progress: true,
        },
      })
    }
  }

  up = await syncAndPopulateUserProgram(up)
  return formatUserProgram(up)
}

/**
 * Fetches the active program for a user.
 */
export async function getActiveUserProgram(userId: string): Promise<UserProgramResponse | null> {
  let up = await prisma.userProgram.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { program: { select: standardProgramSelect }, progress: true },
  })

  if (!up) return null

  up = await syncAndPopulateUserProgram(up)
  return formatUserProgram(up)
}

/**
 * Lists all programs for a user.
 */
export async function listUserPrograms(userId: string): Promise<UserProgramResponse[]> {
  const ups = await prisma.userProgram.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { program: { select: standardProgramSelect }, progress: true },
  })

  return ups.map((up) => formatUserProgram(up))
}
