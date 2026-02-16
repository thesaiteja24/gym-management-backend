import { z } from 'zod'

export const createMuscleGroupSchema = z.object({
	body: z.object({
		title: z.string().min(1, 'Title is required'),
	}),
})

export const updateMuscleGroupSchema = z.object({
	params: z.object({
		id: z.string().uuid('Invalid Muscle Group ID'),
	}),
	body: z.object({
		title: z.string().min(1, 'Title cannot be empty').optional(),
	}),
})
