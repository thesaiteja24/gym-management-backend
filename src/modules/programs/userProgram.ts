import { prisma, readPrisma } from '../../lib/prisma.js'
import {
  deleteCache,
  getCache,
  setCache,
} from '../../service/caching.service.js'
import { ApiError } from '../../utils/ApiError.js'

import { formatUserProgram } from './formatter.js'
import {
  instantiateUserWeek,
  syncAndPopulateUserProgram,
} from './sync.js'
import type { UserProgramResponse } from './types.js'



const standardProgramSelect = {
  id: true,
  title: true,
  description: true,
  experienceLevel: true,
  createdBy: true,
}

const getDateStr = () => new Date().toISOString().split('T')[0]
const getActiveUserProgramCacheKey = (userId: string) =>
  `programs:user:active:${userId}:${getDateStr()}`
const getUserProgramByIdCacheKey = (upId: string, week: number) =>
  `programs:user:id:${upId}:${week}:${getDateStr()}`
const getUserProgramListCacheKey = (userId: string) =>
  `programs:user:list:${userId}:${getDateStr()}`

const USER_PROGRAM_CACHE_TTL = '1d'

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

  await Promise.all([
    deleteCache(getActiveUserProgramCacheKey(userId)),
    deleteCache(getUserProgramListCacheKey(userId)),
  ])

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
  const cacheKey = getUserProgramByIdCacheKey(userProgramId, requestedWeek)
  const cached = await getCache<UserProgramResponse>(cacheKey)
  if (cached) return cached

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
  const response = formatUserProgram(up)
  await setCache(cacheKey, response, USER_PROGRAM_CACHE_TTL)
  return response
}

/**
 * Fetches the active program for a user.
 */
export async function getActiveUserProgram(userId: string): Promise<UserProgramResponse | null> {
  const cacheKey = getActiveUserProgramCacheKey(userId)
  const cached = await getCache<UserProgramResponse>(cacheKey)
  if (cached) return cached

  let up = await readPrisma.userProgram.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { program: { select: standardProgramSelect }, progress: true },
  })

  if (!up) return null

  up = await syncAndPopulateUserProgram(up)
  const response = formatUserProgram(up)
  await setCache(cacheKey, response, USER_PROGRAM_CACHE_TTL)
  return response
}

/**
 * Lists all programs for a user.
 */
export async function listUserPrograms(userId: string): Promise<UserProgramResponse[]> {
  const cacheKey = getUserProgramListCacheKey(userId)
  const cached = await getCache<UserProgramResponse[]>(cacheKey)
  if (cached) return cached

  const ups = await readPrisma.userProgram.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { program: { select: standardProgramSelect }, progress: true },
  })

  const response = ups.map((up) => formatUserProgram(up))
  await setCache(cacheKey, response, USER_PROGRAM_CACHE_TTL)
  return response
}
