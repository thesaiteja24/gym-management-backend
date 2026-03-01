import { EquipmentType, FitnessGoal, FitnessLevel, Gender } from '@prisma/client'
import { z } from 'zod'

export const updateUserSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		dateOfBirth: z.string().datetime().optional(), // Expects ISO string
		preferredWeightUnit: z.enum(['kg', 'lbs']).optional(),
		preferredLengthUnit: z.enum(['cm', 'inches']).optional(),
		height: z.number().positive().optional(),
		weight: z.number().positive().optional(),
		gender: z.enum(Gender).optional(),
	}),
})

export const updateProfilePicSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
})

export const updateFitnessProfileSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		fitnessGoal: z.enum(FitnessGoal).nullable().optional(),
		fitnessLevel: z.enum(FitnessLevel).nullable().optional(),
		targetWeight: z.number().positive().nullable().optional(),
		targetDate: z.string().datetime().nullable().optional(),
		injuries: z.string().nullable().optional(),
		availableEquipment: z.array(z.enum(EquipmentType)).nullable().optional(),
	}),
})

export const addDailyMeasurementSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		date: z.iso.datetime(),
		weight: z.coerce.number().positive().nullable().optional(),
		bodyFat: z.coerce.number().positive().nullable().optional(),
		leanBodyMass: z.coerce.number().positive().nullable().optional(),
		neck: z.coerce.number().positive().nullable().optional(),
		shoulders: z.coerce.number().positive().nullable().optional(),
		chest: z.coerce.number().positive().nullable().optional(),
		waist: z.coerce.number().positive().nullable().optional(),
		leftBicep: z.coerce.number().positive().nullable().optional(),
		rightBicep: z.coerce.number().positive().nullable().optional(),
		leftForearm: z.coerce.number().positive().nullable().optional(),
		rightForearm: z.coerce.number().positive().nullable().optional(),
		abdomen: z.coerce.number().positive().nullable().optional(),
		hips: z.coerce.number().positive().nullable().optional(),
		leftThigh: z.coerce.number().positive().nullable().optional(),
		rightThigh: z.coerce.number().positive().nullable().optional(),
		leftCalf: z.coerce.number().positive().nullable().optional(),
		rightCalf: z.coerce.number().positive().nullable().optional(),
		notes: z.string().nullable().optional(),
	}),
})

export const searchUsersSchema = z.object({
	query: z.object({
		query: z.string().min(3, 'Search query must be at least 3 characters long'),
	}),
})

export const followUserSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
})
