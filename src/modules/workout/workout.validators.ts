import { z } from 'zod'
import { ExerciseGroupType, SetType, WorkoutLogVisibility } from '@prisma/client'

const workoutSetSchema = z.object({
	setIndex: z.number(),
	setType: z.nativeEnum(SetType),
	weight: z.number().nullable().optional(),
	reps: z.number().nullable().optional(),
	rpe: z.number().nullable().optional(),
	durationSeconds: z.number().nullable().optional(),
	restSeconds: z.number().nullable().optional(),
	note: z.string().nullable().optional(),
})

const exerciseInputSchema = z.object({
	exerciseId: z.string().uuid(),
	exerciseIndex: z.number(),
	exerciseGroupId: z.string().optional(),
	sets: z.array(workoutSetSchema),
})

const exerciseGroupInputSchema = z.object({
	id: z.string(),
	groupType: z.nativeEnum(ExerciseGroupType),
	groupIndex: z.number(),
	restSeconds: z.number().optional(),
})

const createWorkoutBody = z.object({
	clientId: z.uuid(),
	title: z.string().optional(),
	startTime: z.string().datetime(),
	endTime: z.string().datetime(),
	visibility: z.enum(WorkoutLogVisibility).default(WorkoutLogVisibility.public),
	exercises: z.array(exerciseInputSchema).min(1, 'At least one exercise is required'),
	exerciseGroups: z.array(exerciseGroupInputSchema).optional(),
})

export const createWorkoutSchema = z.object({
	body: createWorkoutBody,
})

export const updateWorkoutSchema = z.object({
	params: z.object({
		id: z.string().uuid(),
	}),
	body: createWorkoutBody,
})
