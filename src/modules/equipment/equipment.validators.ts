import { z } from 'zod'

export const createEquipmentSchema = z.object({
	body: z.object({
		title: z.string().min(1, 'Title is required'),
	}),
})

export const updateEquipmentSchema = z.object({
	params: z.object({
		id: z.string().uuid('Invalid Equipment ID'),
	}),
	body: z.object({
		title: z.string().min(1, 'Title cannot be empty').optional(),
	}),
})
