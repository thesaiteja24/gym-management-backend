import { z } from 'zod'

export const updateUserSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		dateOfBirth: z.iso.datetime().optional(), // Expects ISO string
		preferredWeightUnit: z.enum(['kg', 'lbs']).optional(),
		preferredLengthUnit: z.enum(['cm', 'inches']).optional(),
		height: z.number().positive().optional(),
		weight: z.number().positive().optional(),
		gender: z.enum(['male', 'female', 'other']).optional(),
	}),
})

export const updateProfilePicSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
})

export const followUserSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
})
