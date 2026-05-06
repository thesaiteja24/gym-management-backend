import type { EquipmentType } from '@prisma/client'

// MAIN

export type MetaResource = 'equipment' | 'muscle-groups'

export interface MetaItem {
  id: string
  title: string
  thumbnailUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface EquipmentItem extends MetaItem {
  type: EquipmentType | null
}

// PAYLOAD

export interface UpsertMetaBody {
  title?: string
  type?: EquipmentType
}

// RESPONSE
