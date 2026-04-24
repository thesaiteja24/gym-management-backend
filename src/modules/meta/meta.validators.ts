import { z } from 'zod'
import { EquipmentType } from '@prisma/client'

const ResourceEnum = z.enum(['equipment', 'muscle-groups'])

export const metaSchema = z.object({
	params: z.object({
		resource: ResourceEnum,
		id: z.uuid('Invalid ID').optional(),
	}),
	body: z.object({
		title: z.string().min(1, 'Title is required').optional(),
		type: z.enum(EquipmentType).optional(),
	}),
})

export const getMetaSchema = z.object({
	params: z.object({
		resource: ResourceEnum,
		id: z.uuid('Invalid ID').optional(),
	}),
})
