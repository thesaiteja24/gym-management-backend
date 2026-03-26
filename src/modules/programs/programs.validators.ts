import { z } from 'zod'

export const createProgramSchema = z.object({
	body: z.object({
		clientId: z.string().uuid('Invalid Client ID'),
		title: z.string().min(1, 'Title is required'),
		description: z.string().optional().nullable(),
		programWeeks: z
			.array(
				z.object({
					name: z.string().min(1, 'Week name is required'),
					weekIndex: z.number().int().min(0, 'Week index is required'),
					days: z
						.array(
							z.object({
								name: z.string().min(1, 'Day name is required'),
								dayIndex: z.number().int().min(0, 'Day index is required'),
								templateId: z.string().uuid('Invalid Template ID').optional().nullable(),
								isRestDay: z.boolean().default(false),
							})
						)
						.min(1, 'Atleast one day is required'),
				})
			)
			.min(1, 'Atleast one week is required'),
	}),
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
	}),
})

export const getProgramsSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
	}),
})

export const getProgramByIdSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
		programId: z.string().uuid('Invalid Program ID'),
	}),
})

export const updateProgramSchema = z.object({
	body: z.object({
		title: z.string().min(1, 'Title is required').optional(),
		description: z.string().optional().nullable(),
		programWeeks: z
			.array(
				z.object({
					id: z.string().optional(),
					name: z.string().min(1, 'Week name is required'),
					weekIndex: z.number().int().min(0, 'Week index is required'),
					days: z
						.array(
							z.object({
								id: z.string().optional(),
								name: z.string().min(1, 'Day name is required'),
								dayIndex: z.number().int().min(0, 'Day index is required'),
								templateId: z.string().uuid('Invalid Template ID').optional().nullable(),
								isRestDay: z.boolean().default(false),
							})
						)
						.min(1, 'Atleast one day is required'),
				})
			)
			.min(1, 'Atleast one week is required')
			.optional(),
	}),
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
		programId: z.string().uuid('Invalid Program ID'),
	}),
})

export const deleteProgramSchema = z.object({
	params: z.object({
		userId: z.string().uuid('Invalid User ID'),
		programId: z.string().uuid('Invalid Program ID'),
	}),
})
