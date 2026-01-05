export function isValidCompletedSet(set, exerciseType) {
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
