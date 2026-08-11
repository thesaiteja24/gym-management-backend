import { z } from 'zod'

const EquipmentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  type: z.enum(['bodyweight', 'dumbbells', 'barbells', 'kettlebells', 'resistanceBands', 'machines', 'other']).nullable(),
}).strict()

const MuscleGroupSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  tags: z.array(z.string()),
}).strict()

const ExerciseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  instructions: z.string().nullable(),
  exerciseType: z.enum(['repsOnly', 'assisted', 'weighted', 'durationOnly']),
  equipment: EquipmentSchema.nullable(),
  primaryMuscleGroup: MuscleGroupSchema.nullable(),
  muscleGroupIds: z.array(z.uuid()),
}).strict()

export const WorkoutCatalogResSchema = z.object({
  equipment: z.array(EquipmentSchema),
  muscleGroups: z.array(MuscleGroupSchema),
  exercises: z.array(ExerciseSchema),
}).strict()
