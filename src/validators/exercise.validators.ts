import { z } from 'zod'
import { ExerciseType } from '@prisma/client'

export const createExerciseSchema = z.object({
	body: z.object({
		title: z.string().min(1, 'Title is required'),
		instructions: z.string().optional(),
		primaryMuscleGroupId: z.string().uuid('Invalid Muscle Group ID'),
		equipmentId: z.string().uuid('Invalid Equipment ID'),
		exerciseType: z.nativeEnum(ExerciseType),
	}),
})

export const updateExerciseSchema = z.object({
	params: z.object({
		id: z.string().uuid('Invalid Exercise ID'),
	}),
	body: z.object({
		title: z.string().min(1, 'Title cannot be empty').optional(),
		instructions: z.string().optional(),
		primaryMuscleGroupId: z.string().uuid('Invalid Muscle Group ID').optional(),
		equipmentId: z.string().uuid('Invalid Equipment ID').optional(),
		exerciseType: z.nativeEnum(ExerciseType).optional(),
	}),
})
