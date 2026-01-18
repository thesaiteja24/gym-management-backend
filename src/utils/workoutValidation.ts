import { ExerciseType, SetType } from '@prisma/client'

export interface WorkoutSet {
	setIndex: number
	setType: SetType
	reps?: number | null
	weight?: number | null
	durationSeconds?: number | null
	rpe?: number | null
	restSeconds?: number | null
	note?: string | null
}

// NOTE: Keep this logic in sync with frontend `utils/workout.ts`
export function isValidCompletedSet(set: WorkoutSet, exerciseType: ExerciseType): boolean {
	const reps = set.reps ?? 0
	const weight = set.weight ?? 0
	const duration = set.durationSeconds ?? 0

	switch (exerciseType) {
		case 'repsOnly':
			return reps > 0

		case 'durationOnly':
			return duration > 0

		case 'weighted':
		case 'assisted':
			return reps > 0 && weight > 0

		default:
			return false
	}
}
