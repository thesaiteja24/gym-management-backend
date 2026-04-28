import type { ExerciseType } from '@prisma/client'

import type { EquipmentItem, MetaItem } from '../meta/types.js'

// MAIN

export interface ExerciseResponse {
  id: string
  title: string
  instructions: string
  primaryMuscleGroupId: string
  equipmentId: string
  exerciseType: ExerciseType
  videoUrl: string
  thumbnailUrl: string
  primaryMuscleGroup: MetaItem
  equipment: EquipmentItem
  otherMuscleGroups: MetaItem[]
}

// PAYLOAD

export interface CreateExerciseBody {
  title: string
  instructions: string
  primaryMuscleGroupId: string
  equipmentId: string
  exerciseType: ExerciseType
  otherMuscleGroupIds?: string[]
}

export type UpdateExerciseBody = Partial<CreateExerciseBody>

// RESPONSE
