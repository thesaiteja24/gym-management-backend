import { Program, ProgramWeek, ProgramDay } from '@prisma/client'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { Request, Response } from 'express'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { logInfo } from '../../common/utils/logger.js'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())

interface CreateProgramBody {
	clientId: string
	title: string
	description?: string | null
	programWeeks: {
		name: string
		weekIndex: number
		days: {
			name: string
			dayIndex: number
			templateId?: string | null
			isRestDay: boolean
		}[]
	}[]
}

interface UpdateProgramBody {
	title?: string
	description?: string | null
	programWeeks?: {
		id?: string
		name: string
		weekIndex: number
		days: {
			id?: string
			name: string
			dayIndex: number
			templateId?: string | null
			isRestDay: boolean
		}[]
	}[]
}

export const createProgram = asyncHandler(
	async (req: Request<{ userId: string }, object, CreateProgramBody>, res: Response) => {
		const userId = req.params.userId
		const { clientId, title, description, programWeeks } = req.body

		const existing = await prisma.program.findUnique({
			where: { clientId },
			include: {
				programWeeks: {
					include: {
						days: true,
					},
				},
			},
		})

		if (existing) {
			logInfo('Program creation idempotent hit', { clientId, programId: existing.id }, req)
			return res.json(new ApiResponse(200, { program: existing }, 'Program already created (Idempotent)'))
		}

		const program = await prisma.program.create({
			data: {
				clientId,
				title,
				description,
				createdBy: userId,
				programWeeks: {
					create: programWeeks.map((week) => ({
						name: week.name,
						weekIndex: week.weekIndex,
						days: {
							create: week.days.map((day) => ({
								name: day.name,
								dayIndex: day.dayIndex,
								templateId: day.templateId,
								isRestDay: day.isRestDay,
							})),
						},
					})),
				},
			},
			include: {
				programWeeks: {
					include: {
						days: true,
					},
				},
			},
		})

		return res.status(201).json(new ApiResponse(201, { program }, 'Program created successfully'))
	}
)

export const getPrograms = asyncHandler(async (req: Request<{ userId: string }>, res: Response) => {
	const { userId } = req.params

	const programs = await prisma.program.findMany({
		where: {
			createdBy: userId,
			deletedAt: null,
		},
		orderBy: {
			createdAt: 'desc',
		},
	})

	return res.json(new ApiResponse(200, { programs }, 'Programs fetched successfully'))
})

export const getProgramById = asyncHandler(
	async (req: Request<{ userId: string; programId: string }>, res: Response) => {
		const { programId } = req.params

		const program = await prisma.program.findFirst({
			where: {
				id: programId,
				deletedAt: null,
			},
			include: {
				programWeeks: {
					include: {
						days: {
							include: {
								template: true,
							},
						},
					},
					orderBy: {
						weekIndex: 'asc',
					},
				},
			},
		})

		if (!program) {
			return res.status(404).json(new ApiResponse(404, null, 'Program not found'))
		}

		return res.json(new ApiResponse(200, { program }, 'Program fetched successfully'))
	}
)

export const updateProgram = asyncHandler(
	async (req: Request<{ userId: string; programId: string }, object, UpdateProgramBody>, res: Response) => {
		const { userId, programId } = req.params
		const { title, description, programWeeks } = req.body

		const existing = await prisma.program.findFirst({
			where: { id: programId, createdBy: userId, deletedAt: null },
		})

		if (!existing) {
			return res.status(404).json(new ApiResponse(404, null, 'Program not found'))
		}

		if (programWeeks) {
			// Delete existing weeks to recreate them
			await prisma.programWeek.deleteMany({
				where: { programId },
			})
		}

		const program = await prisma.program.update({
			where: { id: programId },
			data: {
				...(title !== undefined && { title }),
				...(description !== undefined && { description }),
				...(programWeeks && {
					programWeeks: {
						create: programWeeks.map((week) => ({
							name: week.name,
							weekIndex: week.weekIndex,
							days: {
								create: week.days.map((day) => ({
									name: day.name,
									dayIndex: day.dayIndex,
									templateId: day.templateId,
									isRestDay: day.isRestDay,
								})),
							},
						})),
					},
				}),
			},
			include: {
				programWeeks: {
					include: {
						days: true,
					},
				},
			},
		})

		return res.json(new ApiResponse(200, { program }, 'Program updated successfully'))
	}
)

export const deleteProgram = asyncHandler(
	async (req: Request<{ userId: string; programId: string }>, res: Response) => {
		const { userId, programId } = req.params

		const existing = await prisma.program.findFirst({
			where: { id: programId, createdBy: userId, deletedAt: null },
		})

		if (!existing) {
			return res.status(404).json(new ApiResponse(404, null, 'Program not found'))
		}

		await prisma.program.update({
			where: { id: programId },
			data: {
				deletedAt: new Date(),
			},
		})

		return res.json(new ApiResponse(200, null, 'Program deleted successfully'))
	}
)
