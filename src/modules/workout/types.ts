import type { WorkoutLogVisibility, ExerciseGroupType, SetType } from '@prisma/client'

import type { ExerciseResponse } from '../exercise/types.js'
import type { PublicUser } from '../user/user.types.js'

// MAIN

export interface WorkoutSet {
  id: string
  setIndex: number
  setType: SetType
  weight: number | null
  reps: number | null
  rpe: number | null
  durationSeconds: number | null
  restSeconds: number | null
  note: string | null
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  exerciseIndex: number
  exerciseGroupId: string | null
  exercise: ExerciseResponse
  sets: WorkoutSet[]
}

export interface WorkoutGroup {
  id: string
  groupType: ExerciseGroupType
  groupIndex: number
  restSeconds: number | null
  note: string | null
}

export interface Workout {
  id: string
  clientId: string | null
  shareId: string | null
  title: string | null
  startTime: string
  endTime: string
  createdAt: string
  updatedAt: string
  isEdited: boolean
  editedAt: string | null
  deletedAt: string | null
  visibility: WorkoutLogVisibility
  likesCount: number
  commentsCount: number
  exerciseGroups: WorkoutGroup[]
  exercises: WorkoutExercise[]
  user: PublicUser
}

// PAYLOAD

export interface ExerciseGroupInput {
  id: string // Client-side ID for mapping
  groupType: ExerciseGroupType
  groupIndex: number
  restSeconds?: number
}

export interface WorkoutSetInput {
  setIndex: number
  setType: SetType
  weight?: number | null
  reps?: number | null
  rpe?: number | null
  durationSeconds?: number | null
  restSeconds?: number | null
  note?: string | null
}

export interface ExerciseInput {
  exerciseId: string
  exerciseIndex: number
  exerciseGroupId?: string
  sets: WorkoutSetInput[]
}

export interface CreateWorkoutBody {
  clientId?: string
  title?: string
  startTime: string
  endTime: string
  exercises: ExerciseInput[]
  exerciseGroups?: ExerciseGroupInput[]
  visibility?: WorkoutLogVisibility
  userProgramDayId?: string
}

export type UpdateWorkoutBody = CreateWorkoutBody

// RESPONSE

export interface WorkoutResponse {
  workout: Workout
  meta?: {
    droppedSets: number
    droppedExercises: number
    droppedGroups: number
  }
}

export interface PaginatedWorkoutsResponse {
  workouts: Workout[]
  meta: {
    currentPage: number
    limit: number
    hasMore: boolean
  }
}
