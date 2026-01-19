import { ExerciseGroupType, PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { isValidCompletedSet, WorkoutSet } from '../utils/workoutValidation.js'

const prisma = new PrismaClient().$extends(withAccelerate())

interface ExerciseInput {
	exerciseId: string
	exerciseIndex: number
	exerciseGroupId?: string
	sets: WorkoutSet[]
}

interface ExerciseGroupInput {
	id: string
	groupType: ExerciseGroupType
	groupIndex: number
	restSeconds?: number
}

interface CreateWorkoutBody {
	clientId?: string
	title?: string
	startTime: string
	endTime: string
	exercises: ExerciseInput[]
	exerciseGroups?: ExerciseGroupInput[]
}

interface UpdateWorkoutBody extends CreateWorkoutBody {}

export const createWorkout = asyncHandler(async (req: Request<object, object, CreateWorkoutBody>, res: Response) => {
	const { clientId, title, startTime, endTime, exercises, exerciseGroups } = req.body

	/* ───── Idempotency Check ───── */
	if (clientId) {
		const existing = await prisma.workoutLog.findUnique({
			where: { clientId },
		})

		if (existing) {
			logInfo('Workout creation idempotent hit', { clientId, workoutId: existing.id }, req)
			return res.json(new ApiResponse(200, { workout: existing }, 'Workout already created (Idempotent)'))
		}
	}

	/* ───────────────── Prune Counters ───────────────── */

	let droppedSets = 0
	let droppedExercises = 0
	let droppedGroups = 0

	let workout: { id: string }
	const persistedExercises: { id: string; exerciseGroupId: string | null }[] = []

	/* ───────────────── Transaction ───────────────── */

	try {
		await prisma.$transaction(async tx => {
			/* ───── Create Workout ───── */

			workout = await tx.workoutLog.create({
				data: {
					userId: req.user!.id,
					clientId,
					title,
					startTime: new Date(startTime),
					endTime: new Date(endTime),
				},
			})

			/* ───────────────── Normalize & Create Groups ───────────────── */

			const groupIdMap = new Map<string, string>()

			if (Array.isArray(exerciseGroups) && exerciseGroups.length > 0) {
				const normalized = [...exerciseGroups]
					.sort((a, b) => a.groupIndex - b.groupIndex)
					.map((g, i) => ({ ...g, normalizedIndex: i }))

				for (const group of normalized) {
					const created = await tx.workoutLogExerciseGroup.create({
						data: {
							workoutId: workout.id,
							groupType: group.groupType,
							groupIndex: group.normalizedIndex,
							restSeconds: group.restSeconds ?? null,
						},
					})

					groupIdMap.set(group.id, created.id)
				}
			}

			/* ───────────────── Create Exercises & Sets ───────────────── */

			for (const exercise of exercises) {
				const exerciseMeta = await tx.exercise.findUnique({
					where: { id: exercise.exerciseId },
					select: { exerciseType: true },
				})

				if (!exerciseMeta) {
					droppedExercises++
					logWarn('Exercise not found, skipping', { exerciseId: exercise.exerciseId }, req)
					continue
				}

				const totalSets = Array.isArray(exercise.sets) ? exercise.sets.length : 0

				const validSets = Array.isArray(exercise.sets)
					? exercise.sets.filter(set => isValidCompletedSet(set, exerciseMeta.exerciseType))
					: []

				droppedSets += totalSets - validSets.length

				if (validSets.length === 0) {
					droppedExercises++
					logWarn('No valid sets, dropping exercise', { exerciseId: exercise.exerciseId }, req)
					continue
				}

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

			/* ───── Final Guard ───── */

			if (persistedExercises.length === 0) {
				throw new ApiError(400, 'No valid exercises to save')
			}

			/* ───────────────── Group Pruning (Authoritative) ───────────────── */

			const groupUsage = new Map<string, number>()

			for (const ex of persistedExercises) {
				if (ex.exerciseGroupId) {
					groupUsage.set(ex.exerciseGroupId, (groupUsage.get(ex.exerciseGroupId) ?? 0) + 1)
				}
			}

			for (const [, dbGroupId] of groupIdMap.entries()) {
				const count = groupUsage.get(dbGroupId) ?? 0

				if (count < 2) {
					droppedGroups++

					await tx.workoutLogExerciseGroup.delete({
						where: { id: dbGroupId },
					})

					await tx.workoutLogExercise.updateMany({
						where: { exerciseGroupId: dbGroupId },
						data: { exerciseGroupId: null },
					})
				}
			}

			/* ───────────────── Reindex Remaining Groups ───────────────── */

			const remainingGroups = await tx.workoutLogExerciseGroup.findMany({
				where: { workoutId: workout.id },
				orderBy: { groupIndex: 'asc' },
			})

			for (let i = 0; i < remainingGroups.length; i++) {
				if (remainingGroups[i].groupIndex !== i) {
					await tx.workoutLogExerciseGroup.update({
						where: { id: remainingGroups[i].id },
						data: { groupIndex: i },
					})
				}
			}
		})
	} catch (error) {
		logError('Failed to create workout', error as Error, { action: 'createWorkout' }, req)
		throw error instanceof ApiError ? error : new ApiError(500, 'Failed to create workout')
	}

	/* ───────────────── Response ───────────────── */

	return res.json(
		new ApiResponse(
			201,
			{
				workout: workout!,
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

export const getAllWorkouts = asyncHandler(async (req: Request, res: Response) => {
	const userId = req.user!.id

	/* ───── Query ───── */

	let workouts

	try {
		workouts = await prisma.workoutLog.findMany({
			where: {
				userId,
				deletedAt: null,
			},
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				clientId: true,
				title: true,
				startTime: true,
				endTime: true,
				createdAt: true,
				updatedAt: true,
				isEdited: true,
				editedAt: true,
				exerciseGroups: {
					orderBy: { groupIndex: 'asc' },
					select: {
						id: true,
						groupType: true,
						groupIndex: true,
						restSeconds: true,
					},
				},
				exercises: {
					orderBy: { exerciseIndex: 'asc' },
					select: {
						id: true,
						exerciseId: true,
						exerciseIndex: true,
						exerciseGroupId: true,
						exercise: {
							select: {
								id: true,
								title: true,
								thumbnailUrl: true,
								exerciseType: true,
							},
						},
						sets: {
							orderBy: { setIndex: 'asc' },
						},
					},
				},
			},
		})
	} catch (error) {
		const err = error as Error
		logError('Failed to fetch workouts', err, { action: 'getWorkouts', error: err.message }, req)
		throw new ApiError(500, 'Failed to fetch workouts')
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

export const deleteWorkout = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const workoutId = req.params.id
	const userId = req.user!.id

	let workout

	/* ───── Transaction ───── */

	try {
		workout = await prisma.workoutLog.findUnique({
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

		await prisma.workoutLog.update({
			where: {
				id: workoutId,
			},
			data: {
				deletedAt: new Date(),
			},
		})
	} catch (error) {
		const err = error as Error
		logError('Failed to delete workout', err, { action: 'deleteWorkout', error: err.message, workoutId }, req)
		throw new ApiError(500, 'Failed to delete workout')
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

export const updateWorkout = asyncHandler(
	async (req: Request<{ id: string }, object, UpdateWorkoutBody>, res: Response) => {
		const workoutId = req.params.id
		const userId = req.user!.id
		const { title, startTime, endTime, exercises, exerciseGroups } = req.body

		/* ───────────────── Prune Counters ───────────────── */

		let droppedSets = 0
		let droppedExercises = 0
		let droppedGroups = 0

		const persistedExercises: { id: string; exerciseGroupId: string | null }[] = []

		/* ───────────────── Transaction ───────────────── */

		try {
			await prisma.$transaction(async tx => {
				/* ───── Verify Ownership ───── */

				const existingWorkout = await tx.workoutLog.findUnique({
					where: { id: workoutId },
				})

				if (existingWorkout?.deletedAt) {
					logWarn(
						'Attempt to update deleted workout',
						{
							action: 'updateWorkout',
							workoutId,
							userId,
						},
						req
					)
					throw new ApiError(404, 'Workout not found (deleted)')
				}

				if (!existingWorkout || existingWorkout.userId !== userId) {
					logWarn(
						'Workout not found or does not belong to user',
						{
							action: 'updateWorkout',
							workoutId,
							userId,
						},
						req
					)
					throw new ApiError(404, 'Workout not found')
				}

				/* ───── Delete Existing Exercises & Sets (Cascade) ───── */

				await tx.workoutLogExercise.deleteMany({
					where: { workoutId },
				})

				await tx.workoutLogExerciseGroup.deleteMany({
					where: { workoutId },
				})

				/* ───── Update Workout Metadata ───── */

				await tx.workoutLog.update({
					where: { id: workoutId },
					data: {
						title,
						startTime: new Date(startTime),
						endTime: new Date(endTime),
						isEdited: true,
						editedAt: new Date(),
					},
				})

				/* ───────────────── Normalize & Create Groups ───────────────── */

				const groupIdMap = new Map<string, string>()

				if (Array.isArray(exerciseGroups) && exerciseGroups.length > 0) {
					const normalized = [...exerciseGroups]
						.sort((a, b) => a.groupIndex - b.groupIndex)
						.map((g, i) => ({ ...g, normalizedIndex: i }))

					for (const group of normalized) {
						const created = await tx.workoutLogExerciseGroup.create({
							data: {
								workoutId,
								groupType: group.groupType,
								groupIndex: group.normalizedIndex,
								restSeconds: group.restSeconds ?? null,
							},
						})

						groupIdMap.set(group.id, created.id)
					}
				}

				/* ───────────────── Create Exercises & Sets ───────────────── */

				for (const exercise of exercises) {
					const exerciseMeta = await tx.exercise.findUnique({
						where: { id: exercise.exerciseId },
						select: { exerciseType: true },
					})

					if (!exerciseMeta) {
						droppedExercises++
						logWarn('Exercise not found, skipping', { exerciseId: exercise.exerciseId }, req)
						continue
					}

					const totalSets = Array.isArray(exercise.sets) ? exercise.sets.length : 0

					const validSets = Array.isArray(exercise.sets)
						? exercise.sets.filter(set => isValidCompletedSet(set, exerciseMeta.exerciseType))
						: []

					droppedSets += totalSets - validSets.length

					if (validSets.length === 0) {
						droppedExercises++
						logWarn('No valid sets, dropping exercise', { exerciseId: exercise.exerciseId }, req)
						continue
					}

					const workoutExercise = await tx.workoutLogExercise.create({
						data: {
							workoutId,
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

				/* ───── Final Guard ───── */

				if (persistedExercises.length === 0) {
					throw new ApiError(400, 'No valid exercises to save')
				}

				/* ───────────────── Group Pruning (Authoritative) ───────────────── */

				const groupUsage = new Map<string, number>()

				for (const ex of persistedExercises) {
					if (ex.exerciseGroupId) {
						groupUsage.set(ex.exerciseGroupId, (groupUsage.get(ex.exerciseGroupId) ?? 0) + 1)
					}
				}

				for (const [, dbGroupId] of groupIdMap.entries()) {
					const count = groupUsage.get(dbGroupId) ?? 0

					if (count < 2) {
						droppedGroups++

						await tx.workoutLogExerciseGroup.delete({
							where: { id: dbGroupId },
						})

						await tx.workoutLogExercise.updateMany({
							where: { exerciseGroupId: dbGroupId },
							data: { exerciseGroupId: null },
						})
					}
				}

				/* ───────────────── Reindex Remaining Groups ───────────────── */

				const remainingGroups = await tx.workoutLogExerciseGroup.findMany({
					where: { workoutId },
					orderBy: { groupIndex: 'asc' },
				})

				for (let i = 0; i < remainingGroups.length; i++) {
					if (remainingGroups[i].groupIndex !== i) {
						await tx.workoutLogExerciseGroup.update({
							where: { id: remainingGroups[i].id },
							data: { groupIndex: i },
						})
					}
				}
			})
		} catch (error) {
			logError('Failed to update workout', error as Error, { action: 'updateWorkout' }, req)
			throw error instanceof ApiError ? error : new ApiError(500, 'Failed to update workout')
		}

		/* ───────────────── Response ───────────────── */

		logInfo(
			'Workout updated',
			{
				action: 'updateWorkout',
				workoutId,
				userId,
				pruneReport: { droppedSets, droppedExercises, droppedGroups },
			},
			req
		)

		return res.json(new ApiResponse(200, { id: workoutId }, 'Workout updated successfully'))
	}
)
