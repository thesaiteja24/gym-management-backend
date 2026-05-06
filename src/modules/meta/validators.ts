import { EquipmentType } from '@prisma/client'
import { z } from 'zod'

// ENUMS

const ResourceEnum = z.enum(['equipment', 'muscle-groups'])

// SCHEMAS

export const metaSchema = z.object({
  params: z.object({
    resource: ResourceEnum,
    id: z.uuid('Invalid ID').optional(),
  }),
  body: z.object({
    title: z.string().min(1, 'Title is required').optional(),
    type: z.nativeEnum(EquipmentType).optional(),
  }),
})

export const getMetaSchema = z.object({
  params: z.object({
    resource: ResourceEnum,
    id: z.uuid('Invalid ID').optional(),
  }),
})
