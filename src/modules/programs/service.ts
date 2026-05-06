import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import {
  deleteCache,
  getCache,
  invalidateCachePattern,
  setCache,
} from '../../service/caching.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { formatCompactNumber } from '../../utils/helpers.js'

import {
  invalidateUserProgramCache,
} from './sync.js'
import type {
  CreateProgramBody,
  Program,
  ProgramResponse,
  UpdateProgramBody,
} from './types.js'
import {
  getActiveUserProgram,
  getUserProgramById,
  listUserPrograms,
  startProgram,
} from './userProgram.js'

// SECTION: CONFIG

const prisma = new PrismaClient().$extends(withAccelerate())

// SECTION: CONSTANTS

const getProgramsCacheKey = (page: number, limit: number) => `programs:all:${page}:${limit}`
const getProgramByIdCacheKey = (id: string) => `programs:id:${id}`

const PROGRAMS_CACHE_TTL = '365d'

export {
  getActiveUserProgram,
  getUserProgramById,
  invalidateUserProgramCache,
  listUserPrograms,
  startProgram,
}

// SECTION: PROGRAM SERVICES

/**
 * Fetches all programs with pagination.
 */
export async function getAllPrograms(page: number, limit: number) {
  const cacheKey = getProgramsCacheKey(page, limit)
  const cached = await getCache<any>(cacheKey)
  if (cached) return cached

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

  const response = {
    programs: results,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  }
  await setCache(cacheKey, response, PROGRAMS_CACHE_TTL)
  return response
}

/**
 * Fetches a single program by ID with full week/day details.
 */
export async function getProgramById(programId: string): Promise<ProgramResponse> {
  const cacheKey = getProgramByIdCacheKey(programId)
  const cached = await getCache<ProgramResponse>(cacheKey)
  if (cached) return cached

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

  const response = program as Program
  await setCache(cacheKey, response, PROGRAMS_CACHE_TTL)
  return response
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

  const result = await prisma.program.create({
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

  await invalidateCachePattern('programs:all:*')
  return result
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

  const res = await prisma.$transaction(async (tx) => {
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

    const result = await tx.program.findUnique({
      where: { id: programId },
      include: { weeks: { include: { days: { include: { template: true } } } } },
    })

    return result
  })

  await Promise.all([
    invalidateCachePattern('programs:all:*'),
    deleteCache(getProgramByIdCacheKey(programId)),
  ])

  return res
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

  await Promise.all([
    invalidateCachePattern('programs:all:*'),
    deleteCache(getProgramByIdCacheKey(programId)),
  ])
}
