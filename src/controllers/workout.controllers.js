import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createWorkout = asyncHandler(async (req, res) => {
	const { title, startTime, endTime, exercises } = req.body

	/* ───── Validation ───── */

	if (!startTime || !endTime) {
		logWarn('Start time and end time are required to create workout', { action: 'createWorkout' }, req)
		throw new ApiError(400, 'Start time and end time are required')
	}

	if (!Array.isArray(exercises) || exercises.length === 0) {
		logWarn('Exercises are required to create workout', { action: 'createWorkout' }, req)
		throw new ApiError(400, 'At least one exercise is required')
	}

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

			/* ───── Create WorkoutLogExercise + Sets ───── */

			for (const exercise of exercises) {
				const workoutExercise = await tx.workoutLogExercise.create({
					data: {
						workoutId: workout.id,
						exerciseId: exercise.exerciseId,
						exerciseIndex: exercise.exerciseIndex,
					},
				})

				workoutExercises.push(workoutExercise)

				if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
					logWarn(
						'No sets found for workout exercise, skipping set creation',
						{
							action: 'createWorkout',
							workoutId: workout.id,
							exerciseId: exercise.exerciseId,
						},
						req
					)
					continue
				}

				const setsData = exercise.sets.map(set => ({
					workoutExerciseId: workoutExercise.id,
					setIndex: set.setIndex,
					weight: set.weight ?? null,
					reps: set.reps ?? null,
					rpe: set.rpe ?? null,
					durationSeconds: set.durationSeconds ?? null,
					restSeconds: set.restSeconds ?? null,
					note: set.note ?? null,
				}))

				await tx.workoutLogExerciseSet.createMany({
					data: setsData,
				})
			}
		})
	} catch (error) {
		logError('Failed to create workout', error, { action: 'createWorkout', error: error.message }, req)
		throw new ApiError(500, 'Failed to create workout', error.message)
	}

	/* ───── Success Log ───── */

	logInfo(
		'Workout created',
		{
			action: 'createWorkout',
			workoutId: workout.id,
			exerciseCount: workoutExercises.length,
		},
		req
	)

	/* ───── Response ───── */

	return res.json(
		new ApiResponse(
			201,
			{
				workout,
				exercises: workoutExercises,
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
			where: {
				userId,
			},
			orderBy: {
				createdAt: 'desc',
			},
			include: {
				exercises: {
					orderBy: {
						exerciseIndex: 'asc',
					},
					include: {
						exercise: true, // exercise metadata
						sets: {
							orderBy: {
								setIndex: 'asc',
							},
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
