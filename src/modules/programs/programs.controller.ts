import { FitnessLevel, Prisma, PrismaClient, Program } from '@prisma/client'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { logInfo, logWarn } from '../../common/utils/logger.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { title } from 'node:process'
import { number } from 'zod'

const prisma = new PrismaClient().$extends(withAccelerate())

interface CreateProgramBody {
	clientId: string
	title: string
	description: string
	experienceLevel: FitnessLevel
	durationOptions: number[]
	weeks: Week[]
}

interface Week {
	name: string
	weekIndex: number
	days: Days[]
}

interface Days {
	name: string
	dayIndex: number
	isRestDay: boolean
	templateId?: string
}

interface StartProgramBody {
	duration: number
	startDate: Date
}

const standardProgramSelect = {
	id: true,
	title: true,
	description: true,
	experienceLevel: true,
	createdBy: true,
}

/**
 * Helper to instantiate a specific week for a user program
 * Uses the base program as a template
 */
async function instantiateUserWeek(tx: any, userProgramId: string, program: any, weekIndex: number) {
	const baseWeeks = program.weeks
	const totalBaseWeeks = baseWeeks.length
	const baseWeek = baseWeeks[weekIndex % totalBaseWeeks]

	const userWeek = await tx.userProgramWeek.create({
		data: {
			userProgramId,
			weekIndex: weekIndex,
		},
	})

	for (const day of baseWeek.days) {
		let snapShotId: string | null = null

		if (!day.isRestDay && day.template) {
			const snapshot = await tx.workoutTemplateSnapshot.create({
				data: {
					originalTemplateId: day.templateId,
					title: day.template.title,
					notes: day.template.notes,
					exercises: {
						exerciseGroups: day.template.exerciseGroups,
						exercises: day.template.exercises,
					},
				},
			})
			snapShotId = snapshot.id
		}

		await tx.userProgramDay.create({
			data: {
				userProgramWeekId: userWeek.id,
				name: day.name,
				dayIndex: day.dayIndex,
				isRestDay: day.isRestDay,
				templateSnapshotId: snapShotId,
			},
		})
	}

	return userWeek
}

/**
 * Helper to flatten the templateSnapshot.exercises JSON structure for the API response
 */
function formatUserProgram(userProgram: any) {
	if (!userProgram) return null

	const formattedWeeks = userProgram.weeks?.map((week: any) => ({
		...week,
		days: week.days?.map((day: any) => {
			if (day.templateSnapshot && typeof day.templateSnapshot.exercises === 'object') {
				const snapshot = day.templateSnapshot
				const exerciseData = snapshot.exercises as any

				// Use destructuring to "push out" the internal fields
				const { exercises = [], exerciseGroups = [] } = exerciseData || {}

				// Create a new snapshot object without the nested 'exercises' field
				const { exercises: _, ...restSnapshot } = snapshot

				return {
					...day,
					templateSnapshot: {
						...restSnapshot,
						exercises,
						exerciseGroups,
					},
				}
			}
			return day
		}),
	}))

	// ───── Handle progress.templateSnapshot if it exists (e.g. in getActiveUserProgram) ─────
	const formattedProgress = userProgram.progress
	if (formattedProgress?.templateSnapshot && typeof formattedProgress.templateSnapshot.exercises === 'object') {
		const snapshot = formattedProgress.templateSnapshot
		const exerciseData = snapshot.exercises as any
		const { exercises = [], exerciseGroups = [] } = exerciseData || {}
		const { exercises: _, ...restSnapshot } = snapshot

		formattedProgress.templateSnapshot = {
			...restSnapshot,
			exercises,
			exerciseGroups,
		}
	}

	return {
		...userProgram,
		weeks: formattedWeeks,
		progress: formattedProgress,
	}
}

/**
 * Formats a number into a compact string (e.g., 1k, 200k, 1M)
 */
function formatCompactNumber(count: number): string {
	if (count >= 1000000) {
		return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
	}
	if (count >= 1000) {
		return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
	}
	return count.toString()
}

/**
 * Helper to handle auto-advancing rest days and populating rich progress data
 */
async function syncAndPopulateUserProgram(userProgram: any) {
	if (!userProgram || !userProgram.progress) return userProgram

	let currentWeek = userProgram.progress.currentWeek
	let currentDay = userProgram.progress.currentDay
	let advanced = false

	// ───── Auto-Advance Rest Days ─────

	// Find the last activity date to anchor rest day auto-completion
	let lastActivityDate: Date
	const prevDayIndex = currentDay === 0 ? 6 : currentDay - 1
	const prevWeekIndex = currentDay === 0 ? currentWeek - 1 : currentWeek

	if (prevWeekIndex >= 0) {
		const prevDay = await prisma.userProgramDay.findFirst({
			where: {
				dayIndex: prevDayIndex,
				week: {
					userProgramId: userProgram.id,
					weekIndex: prevWeekIndex,
				},
			},
			select: { completedAt: true },
		})
		lastActivityDate = prevDay?.completedAt || new Date(userProgram.startDate)
	} else {
		// If it's the very first day, use startDate - 1 day as the "previous activity" anchor
		const start = new Date(userProgram.startDate)
		lastActivityDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 1))
	}

	// We use a loop to advance through multiple rest days if they have all passed
	while (true) {
		// Use UTC for all date calculations to avoid timezone issues
		const today = new Date()
		const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

		const lastActivityUTC = Date.UTC(
			lastActivityDate.getUTCFullYear(),
			lastActivityDate.getUTCMonth(),
			lastActivityDate.getUTCDate()
		)
		// The next day is considered "due" on the day after the last activity
		const scheduledDateUTC = lastActivityUTC + 24 * 60 * 60 * 1000

		// If the scheduled date has passed (it was yesterday or earlier in UTC)
		if (scheduledDateUTC < todayUTC) {
			const dayData = await prisma.userProgramDay.findFirst({
				where: {
					dayIndex: currentDay,
					week: {
						userProgramId: userProgram.id,
						weekIndex: currentWeek,
					},
				},
			})

			// If it's a rest day and not completed, auto-complete it
			if (dayData?.isRestDay && !dayData.completed) {
				const now = new Date()
				await prisma.userProgramDay.update({
					where: { id: dayData.id },
					data: { completed: true, completedAt: now },
				})

				// Update lastActivityDate for the next iteration in the loop
				lastActivityDate = now

				// Increment progress
				currentDay++
				if (currentDay >= 7) {
					currentDay = 0
					currentWeek++
				}
				advanced = true

				// Stop if we reach duration limit
				if (currentWeek >= userProgram.durationWeeks) break
			} else {
				// It's a training day that passed, we don't auto-complete training days
				break
			}
		} else {
			// We haven't reached the end of the current day yet
			break
		}
	}

	if (advanced) {
		if (currentWeek < userProgram.durationWeeks) {
			await prisma.userProgramProgress.update({
				where: { id: userProgram.progress.id },
				data: { currentWeek, currentDay },
			})
			// Update the local object for the final response
			userProgram.progress.currentWeek = currentWeek
			userProgram.progress.currentDay = currentDay
		} else {
			// Program finished
			await prisma.userProgram.update({
				where: { id: userProgram.id },
				data: { status: 'completed' },
			})
			userProgram.status = 'completed'
		}
	}

	// ───── Populate Rich Progress Data ─────

	// Fetch current day info for the progress object (updated or original)
	const dayData = await prisma.userProgramDay.findFirst({
		where: {
			dayIndex: userProgram.progress.currentDay,
			week: {
				userProgramId: userProgram.id,
				weekIndex: userProgram.progress.currentWeek,
			},
		},
		include: {
			templateSnapshot: true,
		},
	})

	if (dayData) {
		// Ensure progress is a plain object so extra fields are serialized
		userProgram.progress = {
			...userProgram.progress,
			userProgramDayId: dayData.id,
			workoutTitle: dayData.templateSnapshot?.title || null,
			isRestDay: dayData.isRestDay,
			templateSnapshot: dayData.templateSnapshot,
		}
	}

	return userProgram
}

export const createProgram = asyncHandler(async (req: Request<object, object, CreateProgramBody>, res: Response) => {
	const userId = req.user?.id
	const { clientId, title, description, experienceLevel, durationOptions, weeks } = req.body

	// idempotency check

	const existing = await prisma.program.findUnique({
		where: { clientId },
	})

	if (existing) {
		logWarn('Program idempotency hit', { action: 'createProgram', clientId, programId: existing.id }, req)
		return res.json(new ApiResponse(200, existing, 'Program already created'))
	}

	// check if the templates exist or not

	const templateIds = weeks
		.flatMap(w => w.days)
		.map(d => d.templateId)
		.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)

	const uniqueTemplateIds = [...new Set(templateIds)]

	if (uniqueTemplateIds.length) {
		const templates = await prisma.workoutTemplate.findMany({
			where: {
				id: { in: uniqueTemplateIds },
				deletedAt: null,
				OR: [{ userId }],
			},
			select: { id: true },
		})

		const foundIds = new Set(templates.map(t => t.id))
		const invalidIds = uniqueTemplateIds.filter(id => !foundIds.has(id))

		if (invalidIds.length) {
			throw new ApiError(404, `Invalid templateIds: ${invalidIds.join(', ')}`)
		}
	}

	// sorting the data

	weeks.sort((a, b) => a.weekIndex - b.weekIndex)

	weeks.forEach(week => {
		week.days.sort((a, b) => a.dayIndex - b.dayIndex)
	})

	// create the program

	const program = await prisma.program.create({
		data: {
			clientId,
			title,
			description,
			experienceLevel,
			durationOptions,
			createdBy: userId,

			weeks: {
				create: weeks.map(week => ({
					name: week.name.trim(),
					weekIndex: week.weekIndex,

					days: {
						create: week.days.map(day => ({
							name: day.name.trim(),
							dayIndex: day.dayIndex,
							isRestDay: day.isRestDay,
							templateId: day.isRestDay ? null : day.templateId!,
						})),
					},
				})),
			},
		},
	})

	logInfo('Program created successfully', { action: 'createProgram', id: program.id, title: program.title }, req)

	return res.json(new ApiResponse(200, { program }, 'Program created successfully'))
})

export const getAllPrograms = asyncHandler(async (req: Request, res: Response) => {
	const page = parseInt(req.query.page as string) || 1
	const limit = parseInt(req.query.limit as string) || 20
	const skip = (page - 1) * limit

	const [programs, total] = await Promise.all([
		prisma.program.findMany({
			where: { deletedAt: null },
			include: {
				_count: {
					select: { userPrograms: true },
				},
			},
			skip,
			take: limit,
			orderBy: { createdAt: 'desc' },
		}),
		prisma.program.count({
			where: { deletedAt: null },
		}),
	])

	const programsWithCounts = programs.map(p => ({
		...p,
		enrolledCount: p._count.userPrograms,
		enrolledCountLabel: formatCompactNumber(p._count.userPrograms),
	}))

	return res.json(
		new ApiResponse(
			200,
			{
				programs: programsWithCounts,
				pagination: {
					total,
					page,
					limit,
					pages: Math.ceil(total / limit),
				},
			},
			'Programs fetched successfully'
		)
	)
})

export const getProgramById = asyncHandler(async (req: Request<{ programId: string }>, res: Response) => {
	const programId = req.params.programId

	const program = await prisma.program.findUnique({
		where: {
			id: programId,
		},
		include: {
			weeks: {
				orderBy: {
					weekIndex: 'asc',
				},
				include: {
					days: {
						orderBy: {
							dayIndex: 'asc',
						},
						include: {
							template: {
								include: {
									exerciseGroups: {
										orderBy: { groupIndex: 'asc' },
									},
									exercises: {
										orderBy: { exerciseIndex: 'asc' },
										include: {
											sets: { orderBy: { setIndex: 'asc' } },
											exercise: {
												select: {
													id: true,
													title: true,
													thumbnailUrl: true,
													exerciseType: true,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})

	if (!program) {
		logWarn('Program does not exist', { action: 'getProgramById', program }, req)
		throw new ApiError(404, 'Program does not exist')
	}

	logInfo('Program fetched successfully', { action: 'getProgramById', programId, title: program.title }, req)
	return res.json(new ApiResponse(200, { program }, 'Program fetched successfully'))
})

export const editProgram = asyncHandler(
	async (req: Request<{ programId: string }, object, CreateProgramBody>, res: Response) => {
		const programId = req.params.programId
		const userId = req.user?.id

		const { title, description, experienceLevel, durationOptions, weeks } = req.body

		// 2. Fetch program
		const program = await prisma.program.findUnique({
			where: { id: programId, deletedAt: null },
			select: { id: true, createdBy: true },
		})

		if (!program) {
			logWarn('Program does not exist', { action: 'editProgram', programId }, req)
			throw new ApiError(404, 'Program does not exist')
		}

		if (program.createdBy !== req.user!.id) {
			logWarn('You are not authorized to perform this action', { action: 'editProgram', programId }, req)
			throw new ApiError(403, 'You are not authorized to perform this action')
		}

		// 3. Validate templateIds (ONLY if weeks provided)
		if (weeks) {
			const templateIds = weeks
				.flatMap(w => w.days)
				.map(d => d.templateId)
				.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)

			const uniqueTemplateIds = [...new Set(templateIds)]

			if (uniqueTemplateIds.length) {
				const templates = await prisma.workoutTemplate.findMany({
					where: {
						id: { in: uniqueTemplateIds },
						deletedAt: null,
						OR: [{ userId }],
					},
					select: { id: true },
				})

				const foundIds = new Set(templates.map(t => t.id))
				const invalidIds = uniqueTemplateIds.filter(id => !foundIds.has(id))

				if (invalidIds.length) {
					throw new ApiError(404, `Invalid templateIds: ${invalidIds.join(', ')}`)
				}
			}

			// sort weeks + days
			weeks.sort((a, b) => a.weekIndex - b.weekIndex)
			weeks.forEach(week => {
				week.days.sort((a, b) => a.dayIndex - b.dayIndex)
			})
		}

		// 4. Transaction (the part that saves your reputation)
		const updatedProgram = await prisma.$transaction(async tx => {
			// update base fields
			const updated = await tx.program.update({
				where: { id: programId },
				data: {
					title,
					description,
					experienceLevel,
					durationOptions,
				},
			})

			// if weeks provided → full replace
			if (weeks) {
				// delete old structure
				await tx.programWeek.deleteMany({
					where: { programId },
				})

				// nested create (same as createProgram)
				for (const week of weeks) {
					await tx.programWeek.create({
						data: {
							programId,
							name: week.name.trim(),
							weekIndex: week.weekIndex,

							days: {
								create: week.days.map(day => ({
									name: day.name.trim(),
									dayIndex: day.dayIndex,
									isRestDay: day.isRestDay,
									templateId: day.isRestDay ? null : day.templateId!,
								})),
							},
						},
					})
				}
			}

			const program = await tx.program.findUnique({
				where: {
					id: updated.id,
				},
				include: {
					weeks: {
						orderBy: {
							weekIndex: 'asc',
						},
						include: {
							days: {
								orderBy: {
									dayIndex: 'asc',
								},
								include: {
									template: {
										include: {
											exerciseGroups: {
												orderBy: { groupIndex: 'asc' },
											},
											exercises: {
												orderBy: { exerciseIndex: 'asc' },
												include: {
													sets: { orderBy: { setIndex: 'asc' } },
													exercise: {
														select: {
															id: true,
															title: true,
															thumbnailUrl: true,
															exerciseType: true,
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			})

			return program
		})

		logInfo('Program updated successfully', { action: 'editProgram', programId, title: updatedProgram?.title }, req)

		return res.json(new ApiResponse(200, { program: updatedProgram }, 'Program updated successfully'))
	}
)

export const deleteProgram = asyncHandler(async (req: Request<{ programId: string }>, res: Response) => {
	const programId = req.params.programId

	const program = await prisma.program.findUnique({
		where: {
			id: programId,
		},
		select: {
			id: true,
			createdBy: true,
		},
	})

	if (program?.createdBy !== req.user!.id) {
		logWarn(
			'You are not authorized to perfrom this action',
			{
				action: 'deleteProgram',
				programId: program?.id,
				userId: req.user?.id,
				createdBy: program?.createdBy,
			},
			req
		)
		throw new ApiError(403, 'You are not authorized to perfrom this action')
	}

	const deletedProgram = await prisma.program.update({
		where: {
			id: programId,
			createdBy: req.user!.id,
		},
		data: {
			deletedAt: new Date(),
		},
		select: {
			id: true,
			title: true,
			createdBy: true,
		},
	})

	if (!deletedProgram) {
		logWarn('Program does not exist', { action: 'deleteProgram', deletedProgram }, req)
		throw new ApiError(404, 'Program does not exist')
	}

	logInfo('Program deleted successfully', { action: 'deleteProgram', programId, title: deletedProgram.title }, req)
	return res.json(new ApiResponse(200, null, 'Program deleted successfully'))
})

// User Specific
export const startProgram = asyncHandler(
	async (req: Request<{ userId: string; programId: string }, object, StartProgramBody>, res: Response) => {
		const userId = req.params.userId
		const programId = req.params.programId

		const { duration, startDate } = req.body

		// check if the user is authorized to perform this action
		if (userId !== req.user?.id) {
			logWarn('You are not authorized to perform this action', { action: 'startProgram', programId, userId }, req)
			throw new ApiError(403, 'You are not authorized to perform this action')
		}

		const program = await prisma.program.findUnique({
			where: { id: programId },
			include: {
				weeks: {
					orderBy: { weekIndex: 'asc' },
					include: {
						days: {
							orderBy: { dayIndex: 'asc' },
							include: {
								template: {
									include: {
										exerciseGroups: { orderBy: { groupIndex: 'asc' } },
										exercises: {
											orderBy: { exerciseIndex: 'asc' },
											include: {
												sets: { orderBy: { setIndex: 'asc' } },
												exercise: {
													select: {
														id: true,
														title: true,
														thumbnailUrl: true,
														exerciseType: true,
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		})

		// check if the program exists
		if (!program) {
			logWarn('Program does not exist', { action: 'startProgram', programId }, req)
			throw new ApiError(404, 'Program does not exist')
		}

		// check if the duration is valid
		const MIN_DURATION = 4
		const MAX_DURATION = 16

		if (duration > MAX_DURATION) {
			logWarn('We allow only up to 16 weeks for now', { action: 'startProgram', programId, duration }, req)
			throw new ApiError(400, 'We allow only up to 16 weeks for now')
		}

		if (duration < MIN_DURATION) {
			logWarn('Duration is less than minimum allowed', { action: 'startProgram', programId, duration }, req)
			throw new ApiError(400, 'Minimum duration is 4 weeks')
		}

		const result = await prisma.$transaction(
			async tx => {
				// Deactivate any existing active programs for this user
				await tx.userProgram.updateMany({
					where: {
						userId,
						status: 'active',
					},
					data: {
						status: 'paused',
					},
				})

				const userProgram = await tx.userProgram.create({
					data: {
						userId,
						programId,
						durationWeeks: duration,
						startDate: startDate ?? new Date(),
						status: 'active',
					},
				})

				// Instantiate only Week 0 (Lazy initialization)
				await instantiateUserWeek(tx, userProgram.id, program, 0)

				await tx.userProgramProgress.create({
					data: {
						userProgramId: userProgram.id,
						currentWeek: 0,
						currentDay: 0,
					},
				})

				// Fetch only the instantiated part of the program
				return await tx.userProgram.findUnique({
					where: { id: userProgram.id },
					include: {
						weeks: {
							orderBy: { weekIndex: 'asc' },
							include: {
								days: {
									orderBy: { dayIndex: 'asc' },
									include: {
										templateSnapshot: true,
									},
								},
							},
						},
						program: { select: standardProgramSelect },
						progress: true,
					},
				})
			},
			{ timeout: 10000 }
		)

		return res.json(
			new ApiResponse(200, { userProgram: formatUserProgram(result) }, 'Program started successfully')
		)
	}
)

export const getUserProgramById = asyncHandler(
	async (req: Request<{ userId: string; userProgramId: string }>, res: Response) => {
		const { userId, userProgramId } = req.params
		const requestedWeekIndex = parseInt(req.query.weekIndex as string) || 0

		// Basic auth check
		if (userId !== req.user?.id) {
			logWarn(
				'You are not authorized to perform this action',
				{ action: 'getUserProgram', userProgramId, userId },
				req
			)
			throw new ApiError(403, 'You are not authorized to perform this action')
		}

		let userProgram = await prisma.userProgram.findUnique({
			where: { id: userProgramId },
			include: {
				weeks: {
					where: { weekIndex: requestedWeekIndex },
					include: {
						days: {
							orderBy: { dayIndex: 'asc' },
							include: { templateSnapshot: true },
						},
					},
				},
				program: { select: standardProgramSelect },
				progress: true,
			},
		})

		if (!userProgram || userProgram.userId !== userId) {
			throw new ApiError(404, 'User program not found')
		}

		// Lazy Loading: If the requested week doesn't exist, instantiate it
		if (userProgram.weeks.length === 0) {
			// Check if we haven't exceeded duration
			if (requestedWeekIndex >= userProgram.durationWeeks) {
				throw new ApiError(400, 'Requested week index exceeds program duration')
			}

			// Need the base program definition to instantiate
			const baseProgram = await prisma.program.findUnique({
				where: { id: userProgram.programId },
				include: {
					weeks: {
						orderBy: { weekIndex: 'asc' },
						include: {
							days: {
								orderBy: { dayIndex: 'asc' },
								include: {
									template: {
										include: {
											exerciseGroups: { orderBy: { groupIndex: 'asc' } },
											exercises: {
												orderBy: { exerciseIndex: 'asc' },
												include: {
													sets: { orderBy: { setIndex: 'asc' } },
													exercise: {
														select: {
															id: true,
															title: true,
															thumbnailUrl: true,
															exerciseType: true,
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			})

			if (!baseProgram) throw new ApiError(404, 'Base program not found')

			// Instantiate inside a transaction
			try {
				userProgram = await prisma.$transaction(async tx => {
					await instantiateUserWeek(tx, userProgramId, baseProgram, requestedWeekIndex)

					// Refetch with the new week
					return await tx.userProgram.findUnique({
						where: { id: userProgramId },
						include: {
							weeks: {
								where: { weekIndex: requestedWeekIndex },
								include: {
									days: {
										orderBy: { dayIndex: 'asc' },
										include: { templateSnapshot: true },
									},
								},
							},
							program: { select: standardProgramSelect },
							progress: true,
						},
					})
				})
			} catch (error) {
				// Handle P2002: Unique constraint failed (another request instantiated this week simultaneously)
				if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
					logInfo('Lazy-loading collision detected, refetching existing week', {
						userProgramId,
						requestedWeekIndex,
					})
					userProgram = await prisma.userProgram.findUnique({
						where: { id: userProgramId },
						include: {
							weeks: {
								where: { weekIndex: requestedWeekIndex },
								include: {
									days: {
										orderBy: { dayIndex: 'asc' },
										include: { templateSnapshot: true },
									},
								},
							},
							program: { select: standardProgramSelect },
							progress: true,
						},
					})
				} else {
					throw error
				}
			}
		}

		// Auto-advance rest days and populate rich progress data
		userProgram = await syncAndPopulateUserProgram(userProgram)

		return res.json(
			new ApiResponse(200, { program: formatUserProgram(userProgram) }, 'User program fetched successfully')
		)
	}
)

export const getActiveUserProgram = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const { userId } = req.params

	// Auth check
	if (userId !== req.user?.id) {
		throw new ApiError(403, 'You are not authorized to perform this action')
	}

	let userProgram = await prisma.userProgram.findFirst({
		where: {
			userId,
			status: 'active',
		},
		orderBy: {
			createdAt: 'desc',
		},
		include: {
			program: { select: standardProgramSelect },
			progress: true,
		},
	})

	if (!userProgram) {
		logWarn('No active program found', { action: 'getActiveUserProgram', userId }, req)
		return res.json(new ApiResponse(200, { program: null }, 'No active program found'))
	}

	// Auto-advance rest days and populate rich progress data
	userProgram = await syncAndPopulateUserProgram(userProgram)

	return res.json(
		new ApiResponse(200, { program: formatUserProgram(userProgram) }, 'Active program fetched successfully')
	)
})

export const listUserPrograms = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const { userId } = req.params

	// Auth check
	if (userId !== req.user?.id) {
		throw new ApiError(403, 'You are not authorized to perform this action')
	}

	const userPrograms = await prisma.userProgram.findMany({
		where: {
			userId,
		},
		orderBy: {
			createdAt: 'desc',
		},
		include: {
			program: { select: standardProgramSelect },
			progress: true,
		},
	})

	return res.json(new ApiResponse(200, { programs: userPrograms }, 'User programs fetched successfully'))
})
