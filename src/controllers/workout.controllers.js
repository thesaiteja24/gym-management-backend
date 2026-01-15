import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { isValidCompletedSet } from '../utils/workoutValidation.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createWorkout = asyncHandler(async (req, res) => {
	const { title, startTime, endTime, exercises, exerciseGroups } = req.body

	/* ───── Validation ───── */

	if (!startTime || !endTime) {
		logWarn('Start time and end time are required to create workout', { action: 'createWorkout' }, req)
		throw new ApiError(400, 'Start time and end time are required')
	}

	if (!Array.isArray(exercises) || exercises.length === 0) {
		logWarn('Exercises are required to create workout', { action: 'createWorkout' }, req)
		throw new ApiError(400, 'At least one exercise is required')
	}

	// ───── Structural validation for grouping (NO business rules) ─────
	if (exerciseGroups !== undefined && !Array.isArray(exerciseGroups)) {
		throw new ApiError(400, 'exerciseGroups must be an array')
	}

	/* ───────────────── Prune Counters ───────────────── */

	let droppedSets = 0
	let droppedExercises = 0
	let droppedGroups = 0

	let workout
	const workoutExercises = []

	/* ───── Transaction ───── */

	try {
		await prisma.$transaction(async tx => {
			/* ───── Create WorkoutLog ───── */

			workout = await tx.workoutLog.create({
				data: {
					userId: req.user.id,
					title,
					startTime: new Date(startTime),
					endTime: new Date(endTime),
				},
			})

			/* ───────────────── Normalize & Create Groups ───────────────── */

			const groupIdMap = new Map()

			if (Array.isArray(exerciseGroups) && exerciseGroups.length > 0) {
				const normalizedGroups = [...exerciseGroups]
					.sort((a, b) => a.groupIndex - b.groupIndex)
					.map((group, index) => ({
						...group,
						normalizedIndex: index,
					}))

				for (const group of normalizedGroups) {
					const created = await tx.workoutLogExerciseGroup.create({
						data: {
							workoutId: workout.id,
							groupType: group.groupType,
							groupIndex: group.normalizedIndex,
							restSeconds: group.restSeconds ?? null,
						},
					})

					// Map client temporary ID → DB ID
					groupIdMap.set(group.id, createdGroup.id)
				}
			}

			/* ───────────────── Create Exercises + Sets ───────────────── */

			for (const exercise of exercises) {
				// fetch exercise metadata
				const exerciseMeta = await tx.exercise.findUnique({
					where: { id: exercise.exerciseId },
					select: { exerciseType: true },
				})

				if (!exerciseMeta) {
					logWarn(
						'Exercise not found, skipping',
						{
							action: 'createWorkout',
							exerciseId: exercise.exerciseId,
						},
						req
					)
					droppedExercises++
					continue
				}

				// validate sets
				const validSets = Array.isArray(exercise.sets)
					? exercise.sets.filter(set => isValidCompletedSet(set, exerciseMeta.exerciseType))
					: []

				droppedSets += (exercise.sets?.length ?? 0) - validSets.length

				if (validSets.length === 0) {
					droppedExercises++
					logWarn(
						'No valid sets for exercise, skipping exercise',
						{
							action: 'createWorkout',
							workoutId: workout.id,
							exerciseId: exercise.exerciseId,
						},
						req
					)
					continue
				}

				// create workout exercise
				const workoutExercise = await tx.workoutLogExercise.create({
					data: {
						workoutId: workout.id,
						exerciseId: exercise.exerciseId,
						exerciseIndex: exercise.exerciseIndex,
						exerciseGroupId: exercise.exerciseGroupId
							? (groupIdMap.get(exercise.exerciseGroupId) ?? null)
							: null,
					},
				})

				persistedExercises.push(workoutExercise)

				await tx.workoutLogExerciseSet.createMany({
					data: validSets.map(set => ({
						workoutExerciseId: workoutExercise.id,
						setIndex: set.setIndex,
						setType: set.setType,
						weight: set.weight ?? null,
						reps: set.reps ?? null,
						rpe: set.rpe ?? null,
						durationSeconds: set.durationSeconds ?? null,
						restSeconds: set.restSeconds ?? null,
						note: set.note ?? null,
					})),
				})
			}

			/* ───────────────── Group Pruning (Authoritative) ───────────────── */

			const groupUsage = new Map()

			for (const ex of persistedExercises) {
				if (ex.exerciseGroupId) {
					groupUsage.set(ex.exerciseGroupId, (groupUsage.get(ex.exerciseGroupId) ?? 0) + 1)
				}
			}

			for (const [groupId, count] of groupUsage.entries()) {
				if (count < 2) {
					droppedGroups++

					await tx.workoutLogExerciseGroup.delete({
						where: { id: groupId },
					})

					await tx.workoutLogExercise.updateMany({
						where: { exerciseGroupId: groupId },
						data: { exerciseGroupId: null },
					})
				}
			}
		})
	} catch (error) {
		logError('Failed to create workout', error, { action: 'createWorkout' }, req)
		throw new ApiError(500, 'Failed to create workout')
	}

	/* ───────────────── Response ───────────────── */

	return res.json(
		new ApiResponse(
			201,
			{
				workout,
				meta: {
					droppedSets,
					droppedExercises,
					droppedGroups,
				},
			},
			'Workout created successfully'
		)
	)
})

export const getAllWorkouts = asyncHandler(async (req, res) => {
	const userId = req.user?.id

	if (!userId) {
		logWarn('User not authenticated while fetching workouts', { action: 'getWorkouts' }, req)
		throw new ApiError(401, 'Unauthorized')
	}

	let workouts

	try {
		workouts = await prisma.workoutLog.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			include: {
				exerciseGroups: {
					orderBy: { groupIndex: 'asc' },
				},
				exercises: {
					orderBy: { exerciseIndex: 'asc' },
					include: {
						exercise: true,
						sets: {
							orderBy: { setIndex: 'asc' },
						},
					},
				},
			},
		})
	} catch (error) {
		logError('Failed to fetch workouts', error, { action: 'getWorkouts', error: error.message }, req)
		throw new ApiError(500, 'Failed to fetch workouts', error.message)
	}

	if (!workouts || workouts.length === 0) {
		logInfo('No workouts found for user', { action: 'getWorkouts', userId }, req)
		return res.json(new ApiResponse(200, [], 'No workouts found'))
	}

	logInfo(
		'Workouts fetched',
		{
			action: 'getWorkouts',
			userId,
			workoutCount: workouts.length,
		},
		req
	)

	return res.json(new ApiResponse(200, workouts, 'Workouts fetched successfully'))
})

export const deleteWorkout = asyncHandler(async (req, res) => {
	const workoutId = req.params.id
	const userId = req.user?.id

	/* ───── Validation ───── */

	if (!userId) {
		logWarn('User not authenticated while deleting workout', { action: 'deleteWorkout' }, req)
		throw new ApiError(401, 'Unauthorized')
	}

	if (!workoutId) {
		logWarn('Workout ID is required to delete workout', { action: 'deleteWorkout' }, req)
		throw new ApiError(400, 'Workout ID is required')
	}

	let workout

	/* ───── Transaction ───── */

	try {
		workout = await prisma.workoutLog.findUnique({
			// TODO: Fix composite key deletion once Prisma supports it
			// where: {
			// 	id_userId: {
			// 		id: workoutId,
			// 		userId,
			// 	},
			// },
			where: {
				id: workoutId,
			},
		})

		if (!workout || workout.userId !== userId) {
			logWarn(
				'Workout not found or does not belong to user',
				{
					action: 'deleteWorkout',
					workoutId,
					userId,
				},
				req
			)
			throw new ApiError(404, 'Workout not found')
		}

		await prisma.workoutLog.delete({
			where: {
				id: workoutId,
			},
		})
	} catch (error) {
		logError('Failed to delete workout', error, { action: 'deleteWorkout', error: error.message, workoutId }, req)
		throw new ApiError(500, 'Failed to delete workout', error.message)
	}

	/* ───── Success Log ───── */

	logInfo(
		'Workout deleted',
		{
			action: 'deleteWorkout',
			workoutId,
			userId,
		},
		req
	)

	/* ───── Response ───── */

	return res.json(new ApiResponse(200, null, 'Workout deleted successfully'))
})
