import type { Prisma } from '@prisma/client'

import { flattenExercise } from '../exercise/service.js'
import { formatPublicUser } from '../user/service.js'

import type { workoutSelect } from './service.js'
import type { Workout } from './types.js'

/**
 * Formats the exercises and sets within a workout.
 */
export function formatWorkoutExercises(exercises: any[]) {
  return (exercises || []).map((we) => ({
    ...we,
    exercise: flattenExercise(we.exercise),
    sets: (we.sets || []).map((s: any) => ({
      ...s,
      weight: s.weight ? Number(s.weight) : null,
    })),
  }))
}

/**
 * Formats the exercise groups within a workout.
 */
export function formatWorkoutGroups(groups: any[]) {
  return (groups || []).map((eg) => ({
    ...eg,
    restSeconds: eg.restSeconds ?? null,
    note: eg.note ?? null,
  }))
}

/**
 * Formats a raw Prisma workout log into the standardized Workout interface.
 */
export function formatWorkout(
  workout: Prisma.WorkoutLogGetPayload<{ select: typeof workoutSelect }>,
): Workout {
  if (!workout) return null as any

  return {
    ...workout,
    startTime: workout.startTime?.toISOString() || '',
    endTime: workout.endTime?.toISOString() || '',
    createdAt: workout.createdAt?.toISOString(),
    updatedAt: workout.updatedAt?.toISOString(),
    editedAt: workout.editedAt?.toISOString() || null,
    deletedAt: workout.deletedAt?.toISOString() || null,
    exercises: formatWorkoutExercises(workout.exercises as any[]),
    exerciseGroups: formatWorkoutGroups(workout.exerciseGroups as any[]),
    user: formatPublicUser(workout.user),
  } as Workout
}
