import { ExerciseType } from '@prisma/client'
import { z } from 'zod'

const stringOrArrayToArray = z
  .union([z.uuid(), z.array(z.uuid())])
  .transform((val) => (Array.isArray(val) ? val : [val]))

export const createExerciseSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required'),
    instructions: z.string().min(1, 'Instructions are required'),
    primaryMuscleGroupId: z.uuid('Invalid Muscle Group ID'),
    equipmentId: z.uuid('Invalid Equipment ID'),
    exerciseType: z.enum(ExerciseType),

    otherMuscleGroupIds: stringOrArrayToArray.optional(),
  }),
  file: z.any().refine((file) => !!file, 'Exercise video is required'),
})

export const updateExerciseSchema = z.object({
  params: z.object({
    id: z.uuid('Invalid Exercise ID'),
  }),
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    instructions: z.string().optional(),
    primaryMuscleGroupId: z.uuid('Invalid Muscle Group ID').optional(),
    equipmentId: z.uuid('Invalid Equipment ID').optional(),
    exerciseType: z.enum(ExerciseType).optional(),

    otherMuscleGroupIds: stringOrArrayToArray.optional(),
  }),
})
