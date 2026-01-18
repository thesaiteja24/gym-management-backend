import { z } from 'zod'
import { ExerciseGroupType, SetType } from '@prisma/client'

const templateSetSchema = z.object({
	setIndex: z.number(),
	setType: z.nativeEnum(SetType),
	weight: z.number().nullable().optional(),
	reps: z.number().nullable().optional(),
	rpe: z.number().nullable().optional(),
	durationSeconds: z.number().nullable().optional(),
	restSeconds: z.number().nullable().optional(),
})

const templateExerciseInputSchema = z.object({
	exerciseId: z.string().uuid(),
	exerciseIndex: z.number(),
	exerciseGroupId: z.string().optional(),
	sets: z.array(templateSetSchema),
})

const templateExerciseGroupInputSchema = z.object({
	id: z.string(),
	groupType: z.nativeEnum(ExerciseGroupType),
	groupIndex: z.number(),
	restSeconds: z.number().optional(),
})

const createTemplateBody = z.object({
	title: z.string().min(1, 'Title is required'),
	notes: z.string().nullable().optional(),
	exercises: z.array(templateExerciseInputSchema).min(1, 'At least one exercise is required'),
	exerciseGroups: z.array(templateExerciseGroupInputSchema).optional(),
})

export const createTemplateSchema = z.object({
	body: createTemplateBody,
})

export const updateTemplateSchema = z.object({
	params: z.object({
		id: z.string().uuid(),
	}),
	body: createTemplateBody,
})
