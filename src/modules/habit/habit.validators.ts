import { z } from 'zod'

export const createHabitSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
	}),
	body: z.object({
		title: z.string().min(1).max(16, 'Title must be 16 characters or less'),
		colorScheme: z.string(),
		trackingType: z.enum(['streak', 'quantity']),
		targetValue: z.number().positive().optional().nullable(),
		unit: z.string().optional().nullable(),
		footerType: z.enum(['weeklyStreak', 'weeklyCount']).default('weeklyStreak'),
		source: z.enum(['manual', 'internal']).default('manual'),
		internalMetricId: z.string().optional().nullable(),
	}),
})

export const updateHabitSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
		id: z.string().uuid('Invalid Habit ID'),
	}),
	body: z.object({
		title: z.string().min(1).max(16).optional(),
		colorScheme: z.string().optional(),
		trackingType: z.enum(['streak', 'quantity']).optional(),
		targetValue: z.number().positive().optional().nullable(),
		unit: z.string().optional().nullable(),
		footerType: z.enum(['weeklyStreak', 'weeklyCount']).optional(),
		source: z.enum(['manual', 'internal']).optional(),
		internalMetricId: z.string().optional().nullable(),
	}),
})

export const logHabitSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
		id: z.string().uuid('Invalid Habit ID'),
	}),
	body: z.object({
		date: z.string().datetime(), // ISO string
		value: z.number(),
	}),
})

export const getHabitLogsSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
	}),
	query: z.object({
		startDate: z.string().datetime().optional(),
		endDate: z.string().datetime().optional(),
	}),
})
