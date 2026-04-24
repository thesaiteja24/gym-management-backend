import { z } from 'zod'
import { EquipmentType } from '@prisma/client'

export const createEquipmentSchema = z.object({
	body: z.object({
		title: z.string().min(1, 'Title is required'),
		type: z.enum(EquipmentType).optional(),
	}),
})

export const updateEquipmentSchema = z.object({
	params: z.object({
		id: z.string().uuid('Invalid Equipment ID'),
	}),
	body: z.object({
		title: z.string().min(1, 'Title cannot be empty').optional(),
		type: z.enum(EquipmentType).optional(),
	}),
})
