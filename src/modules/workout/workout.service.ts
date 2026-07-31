import type { FastifyInstance } from 'fastify'
import { CACHE_KEYS, CACHE_TTL } from '@/config/cache'
import { getOrSetCache } from '@/services/cache.service'

export function getWorkoutCatalog(app: FastifyInstance) {
  return getOrSetCache(app.redis, CACHE_KEYS.workoutCatalog(), CACHE_TTL.week, async () => {
    const [equipment, muscleGroups, exercises] = await Promise.all([
      app.prisma.equipment.findMany({
        orderBy: { title: 'asc' },
        select: { id: true, title: true, thumbnailUrl: true, type: true },
      }),
      app.prisma.muscleGroup.findMany({
        orderBy: { title: 'asc' },
        select: { id: true, title: true, thumbnailUrl: true, tags: true },
      }),
      app.prisma.exercise.findMany({
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          exerciseType: true,
          primaryMuscleGroupId: true,
          equipment: { select: { id: true, title: true, thumbnailUrl: true, type: true } },
          primaryMuscleGroup: { select: { id: true, title: true, thumbnailUrl: true, tags: true } },
          otherMuscleGroups: { select: { muscleGroupId: true } },
        },
      }),
    ])

    return {
      equipment,
      muscleGroups,
      exercises: exercises.map(({ otherMuscleGroups, primaryMuscleGroupId, ...exercise }) => ({
        ...exercise,
        muscleGroupIds: [
          ...(primaryMuscleGroupId ? [primaryMuscleGroupId] : []),
          ...otherMuscleGroups.map(group => group.muscleGroupId),
        ],
      })),
    }
  })
}
