import { z } from 'zod'
import { FitnessLevel, ProgramWeekType } from '@prisma/client'

const daySchema = z
	.object({
		name: z.string().min(1, 'Day name is required').trim(),

		dayIndex: z.number().int().min(0).max(6, 'dayIndex must be between 0 and 6'),

		isRestDay: z.boolean(),

		templateId: z.uuid('Invalid Template ID').optional().nullable(),
	})
	.superRefine((day, ctx) => {
		if (day.isRestDay && day.templateId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Rest day cannot have templateId',
				path: ['templateId'],
			})
		}

		if (!day.isRestDay && !day.templateId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Workout day must have templateId',
				path: ['templateId'],
			})
		}
	})

const weekSchema = z
	.object({
		name: z.string().min(1, 'Week name is required').trim(),

		weekIndex: z.number().int().min(0),

		days: z.array(daySchema).min(1, 'At least one day is required').max(7, 'Week cannot have more than 7 days'),
	})
	.superRefine((week, ctx) => {
		const seen = new Set<number>()

		week.days.forEach((day, i) => {
			if (seen.has(day.dayIndex)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Duplicate dayIndex: ${day.dayIndex}`,
					path: ['days', i, 'dayIndex'],
				})
			}
			seen.add(day.dayIndex)
		})
	})

export const createProgramSchema = z.object({
	body: z
		.object({
			clientId: z.uuid('Invalid Client ID'),

			title: z.string().min(1, 'Title is required').trim(),

			description: z.string().optional().nullable(),

			experienceLevel: z.enum(FitnessLevel),

			durationOptions: z.array(z.number().int().positive()).min(1, 'At least one duration option is required'),

			weeks: z.array(weekSchema).min(1, 'At least one week is required'),
		})
		.superRefine((data, ctx) => {
			const seen = new Set<number>()

			data.weeks.forEach((week, i) => {
				if (seen.has(week.weekIndex)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `Duplicate weekIndex: ${week.weekIndex}`,
						path: ['weeks', i, 'weekIndex'],
					})
				}
				seen.add(week.weekIndex)
			})
		}),

	params: z.object({
		userId: z.uuid('Invalid User ID'),
	}),
})

export const updateProgramSchema = z.object({
	body: z.object({
		title: z.string().min(1).optional(),
		description: z.string().optional().nullable(),
		experienceLevel: z.enum(FitnessLevel).optional(),
		durationOptions: z.array(z.number().int().positive()).optional(),

		weeks: z.array(weekSchema).min(1, 'At least one week is required').optional(),
	}),

	params: z.object({
		userId: z.uuid('Invalid User ID'),
		programId: z.uuid('Invalid Program ID'),
	}),
})

export const getProgramsSchema = z.object({
	params: z.object({
		userId: z.uuid('Invalid User ID'),
	}),
})

export const getProgramByIdSchema = z.object({
	params: z.object({
		userId: z.uuid('Invalid User ID'),
		programId: z.uuid('Invalid Program ID'),
	}),
})

export const deleteProgramSchema = z.object({
	params: z.object({
		userId: z.uuid('Invalid User ID'),
		programId: z.uuid('Invalid Program ID'),
	}),
})
