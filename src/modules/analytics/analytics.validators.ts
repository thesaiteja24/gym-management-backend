import { z } from 'zod'

export const updateFitnessProfileSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		fitnessGoal: z
			.enum([
				'loseWeight',
				'gainMuscle',
				'improveEndurance',
				'improveFlexibility',
				'improveStrength',
				'improveOverallFitness',
			])
			.nullable()
			.optional(),
		fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).nullable().optional(),
		activityLevel: z
			.enum(['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'athlete'])
			.nullable()
			.optional(),
		targetType: z.enum(['weight', 'bodyFat']).nullable().optional(),
		targetWeight: z.number().positive().nullable().optional(),
		targetBodyFat: z.number().positive().nullable().optional(),
		weeklyWeightChange: z.number().positive().nullable().optional(),
		targetDate: z.string().datetime().nullable().optional(),
		injuries: z.string().nullable().optional(),
		availableEquipment: z
			.array(
				z.enum(['bodyweight', 'dumbbells', 'barbells', 'kettlebells', 'resistanceBands', 'machines', 'other'])
			)
			.nullable()
			.optional(),
		nutritionPlan: z
			.object({
				caloriesTarget: z.number().positive().nullable().optional(),
				proteinTarget: z.number().positive().nullable().optional(),
				calculatedTDEE: z.number().positive().nullable().optional(),
				deficitOrSurplus: z.number().nullable().optional(),
				startDate: z.string().datetime().optional(),
			})
			.optional(),
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

export const updateNutritionPlanSchema = z.object({
	params: z.object({
		id: z.uuid('Invalid User ID'),
	}),
	body: z.object({
		caloriesTarget: z.number().positive().nullable().optional(),
		proteinTarget: z.number().positive().nullable().optional(),
		fatsTarget: z.number().positive().nullable().optional(),
		carbsTarget: z.number().positive().nullable().optional(),
		calculatedTDEE: z.number().positive().nullable().optional(),
		deficitOrSurplus: z.number().nullable().optional(),
		startDate: z.string().datetime().nullable().optional(),
	}),
})
