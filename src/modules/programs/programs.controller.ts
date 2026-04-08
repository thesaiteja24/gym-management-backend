import { FitnessLevel, PrismaClient, Program } from '@prisma/client'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { Request, Response } from 'express'
import { withAccelerate } from '@prisma/extension-accelerate'
import { logInfo, logWarn } from '../../common/utils/logger.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { title } from 'node:process'

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

export const createProgram = asyncHandler(
	async (req: Request<{ userId: string }, object, CreateProgramBody>, res: Response) => {
		const userId = req.params.userId
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
	}
)

export const getAllPrograms = asyncHandler(async (req: Request, res: Response) => {
	const programs = await prisma.program.findMany({
		where: {
			deletedAt: null,
		},
	})

	if (!programs.length) {
		logWarn('Programs does not exist', { action: 'getAllPrograms', count: programs.length }, req)
		throw new ApiError(404, 'No programs exist')
	}

	logInfo('Program fetched successfully', { action: 'getAllPrograms', count: programs.length }, req)
	return res.json(new ApiResponse(200, { programs }, 'Programs fetched successfully'))
})

export const getProgramById = asyncHandler(
	async (req: Request<{ userId: string; programId: string }>, res: Response) => {
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
	}
)

export const editProgram = asyncHandler(
	async (req: Request<{ programId: string; userId: string }, object, CreateProgramBody>, res: Response) => {
		const programId = req.params.programId
		const userId = req.params.userId

		const { title, description, experienceLevel, durationOptions, weeks } = req.body

		// 1. Basic auth check
		if (userId !== req.user?.id) {
			logWarn('Unauthorized access attempt', { action: 'editProgram', programId, userId }, req)
			throw new ApiError(403, 'You are not authorized to perform this action')
		}

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
			logWarn('You are not authorized to perform this action', { action: 'editProgram', programId, userId }, req)
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

export const deleteProgram = asyncHandler(
	async (req: Request<{ programId: string; userId: string }>, res: Response) => {
		const programId = req.params.programId
		const userId = req.params.userId

		if (userId !== req.user?.id) {
			logWarn(
				'You are not authorized to perfrom this action',
				{ action: 'deleteProgram', programId, userId },
				req
			)
			throw new ApiError(403, 'You are not authorized to perfrom this action')
		}

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

		logInfo(
			'Program deleted successfully',
			{ action: 'deleteProgram', programId, title: deletedProgram.title },
			req
		)
		return res.json(new ApiResponse(200, null, 'Program deleted successfully'))
	}
)
