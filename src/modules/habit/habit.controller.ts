import { HabitSource, PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug } from '../../common/utils/logger.js'
import { ApiError } from '../../common/utils/ApiError.js'

const prisma = new PrismaClient().$extends(withAccelerate())

/**
 * Get all habits for a user
 */
export const getHabits = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const { userId } = req.params

	const habits = await prisma.habit.findMany({
		where: { userId },
		orderBy: { createdAt: 'asc' },
	})

	logDebug('Fetched habits for user', { userId })
	return res.status(200).json(new ApiResponse(200, habits, 'Habits fetched successfully'))
})

/**
 * Create a new habit
 */
export const createHabit = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const { userId } = req.params
	const data = req.body

	const existingInternalHabit = await prisma.habit.findFirst({
		where: {
			userId: userId,
			internalMetricId: data.internalMetricId,
		},
	})

	if (existingInternalHabit) {
		throw new ApiError(400, 'You already track this habit')
	}

	const habit = await prisma.habit.create({
		data: {
			...data,
			userId,
		},
	})

	logDebug('Created new habit', { userId, habitId: habit.id })
	return res.status(201).json(new ApiResponse(201, habit, 'Habit created successfully'))
})

/**
 * Update a habit
 */
export const updateHabit = asyncHandler(async (req: Request<{ userId: string; id: string }>, res: Response) => {
	const { id } = req.params
	const data = req.body

	const habit = await prisma.habit.update({
		where: { id },
		data,
	})

	logDebug('Updated habit', { habitId: habit.id })
	return res.status(200).json(new ApiResponse(200, habit, 'Habit updated successfully'))
})

/**
 * Delete a habit
 */
export const deleteHabit = asyncHandler(async (req: Request<{ userId: string; id: string }>, res: Response) => {
	const { id } = req.params

	await prisma.habit.delete({
		where: { id },
	})

	logDebug('Deleted habit', { habitId: id })
	return res.status(200).json(new ApiResponse(200, null, 'Habit deleted successfully'))
})

/**
 * Log progress for a manual habit
 */
export const logHabit = asyncHandler(async (req: Request<{ userId: string; id: string }>, res: Response) => {
	const { id } = req.params
	const { date, value } = req.body

	const parsedDate = new Date(date)
	parsedDate.setUTCHours(0, 0, 0, 0)

	const log = await prisma.habitLog.upsert({
		where: {
			habitId_date: {
				habitId: id,
				date: parsedDate,
			},
		},
		update: { value },
		create: {
			habitId: id,
			date: parsedDate,
			value,
		},
	})

	logDebug('Logged habit progress', { habitId: id, date: parsedDate.toISOString() })
	return res.status(200).json(new ApiResponse(200, log, 'Habit progress logged successfully'))
})

/**
 * Get logs for all habits, including virtual logs for internal metrics
 */
export const getHabitLogs = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const { userId } = req.params
	const { startDate, endDate } = req.query

	const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
	const end = endDate ? new Date(endDate as string) : new Date()

	start.setUTCHours(0, 0, 0, 0)
	end.setUTCHours(23, 59, 59, 999)

	// 1. Fetch all habits
	const habits = await prisma.habit.findMany({
		where: { userId },
	})

	// 2. Fetch manual logs
	const manualLogs = await prisma.habitLog.findMany({
		where: {
			habit: { userId },
			date: { gte: start, lte: end },
		},
	})

	// 3. Prepare response structure: Map<habitId, logs[]>
	const logsMap: Record<string, any[]> = {}
	habits.forEach(h => {
		logsMap[h.id] = []
	})

	// Add manual logs to map
	manualLogs.forEach(log => {
		if (logsMap[log.habitId]) {
			logsMap[log.habitId].push({
				date: log.date,
				value: Number(log.value),
			})
		}
	})

	// 4. Handle internal metrics
	const internalHabits = habits.filter(h => h.source === HabitSource.internal)

	if (internalHabits.length > 0) {
		const needsMeasurements = internalHabits.some(h =>
			['weight', 'bodyFat', 'waist'].includes(h.internalMetricId || '')
		)
		const needsWorkouts = internalHabits.some(h => h.internalMetricId === 'workout')

		let measurements: any[] = []
		if (needsMeasurements) {
			measurements = await prisma.userMeasurement.findMany({
				where: {
					userId,
					date: { gte: start, lte: end },
				},
				select: {
					date: true,
					weight: true,
					bodyFat: true,
					waist: true,
				},
			})
		}

		let workouts: any[] = []
		if (needsWorkouts) {
			workouts = await prisma.workoutLog.findMany({
				where: {
					userId,
					startTime: { gte: start, lte: end },
					deletedAt: null,
				},
				select: {
					startTime: true,
				},
			})
		}

		// Distribute virtual logs
		internalHabits.forEach(h => {
			if (h.internalMetricId === 'workout') {
				const workoutDates = new Set(workouts.map(w => new Date(w.startTime).toISOString().split('T')[0]))
				workoutDates.forEach(dateStr => {
					logsMap[h.id].push({
						date: new Date(dateStr),
						value: 1, // binary completion
					})
				})
			} else if (h.internalMetricId === 'weight') {
				measurements.forEach(m => {
					if (m.weight !== null) {
						logsMap[h.id].push({
							date: m.date,
							value: 1, // weight tracking is usually a binary "did you weigh in?" heatmap
						})
					}
				})
			} else if (h.internalMetricId === 'bodyFat') {
				measurements.forEach(m => {
					if (m.bodyFat !== null) {
						logsMap[h.id].push({
							date: m.date,
							value: 1,
						})
					}
				})
			} else if (h.internalMetricId === 'waist') {
				measurements.forEach(m => {
					if (m.waist !== null) {
						logsMap[h.id].push({
							date: m.date,
							value: 1,
						})
					}
				})
			}
		})
	}

	logDebug('Fetched habit logs with virtual internal metrics', { userId, habitCount: habits.length })
	return res.status(200).json(new ApiResponse(200, logsMap, 'Habit logs fetched successfully'))
})
