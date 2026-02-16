import { EquipmentType, FitnessGoal, FitnessLevel } from '@prisma/client'
import { z } from 'zod'

export const updateUserSchema = z.object({
	params: z.object({
		id: z.string().uuid('Invalid User ID'),
	}),
	body: z.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		dateOfBirth: z.string().datetime().optional(), // Expects ISO string
		preferredWeightUnit: z.enum(['kg', 'lbs']).optional(),
		preferredLengthUnit: z.enum(['cm', 'inches']).optional(),
		height: z.number().positive().optional(),
		weight: z.number().positive().optional(),
	}),
})

export const updateProfilePicSchema = z.object({
	params: z.object({
		id: z.string().uuid('Invalid User ID'),
	}),
})

export const updateFitnessProfileSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		fitnessGoal: z.enum(FitnessGoal).nullable().optional(),
		fitnessLevel: z.enum(FitnessLevel).nullable().optional(),
		injuries: z.string().nullable().optional(),
		availableEquipment: z.array(z.enum(EquipmentType)).nullable().optional(),
	}),
})
