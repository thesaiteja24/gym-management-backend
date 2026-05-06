import { ExerciseGroupType, SetType, WorkoutLogVisibility } from '@prisma/client'
import { z } from 'zod'

/**
 * Validator for a single workout set.
 */
const workoutSetSchema = z.object({
  setIndex: z.number().int().nonnegative(),
  setType: z.enum(SetType),
  weight: z.number().nullable().optional(),
  reps: z.number().int().nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  restSeconds: z.number().int().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})

/**
 * Validator for an exercise within a workout.
 */
const exerciseInputSchema = z.object({
  exerciseId: z.uuid(),
  exerciseIndex: z.number().int().nonnegative(),
  exerciseGroupId: z.string().optional(),
  sets: z.array(workoutSetSchema).min(1, 'At least one set is required'),
})

/**
 * Validator for an exercise group (superset/giantset).
 */
const exerciseGroupInputSchema = z.object({
  id: z.string(), // Client-side ID for mapping
  groupType: z.enum(ExerciseGroupType),
  groupIndex: z.number().int().nonnegative(),
  restSeconds: z.number().int().optional(),
})

/**
 * Validator for creating or updating a workout log.
 */
const workoutBodySchema = z.object({
  clientId: z.uuid().optional(),
  userProgramDayId: z.uuid().optional(),
  title: z.string().max(255).optional(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  visibility: z.enum(WorkoutLogVisibility).default(WorkoutLogVisibility.public),
  exercises: z.array(exerciseInputSchema).min(1, 'At least one exercise is required'),
  exerciseGroups: z.array(exerciseGroupInputSchema).optional(),
})

export const createWorkoutSchema = z.object({
  body: workoutBodySchema,
})

export const updateWorkoutSchema = z.object({
  params: z.object({
    id: z.uuid(),
  }),
  body: workoutBodySchema,
})
