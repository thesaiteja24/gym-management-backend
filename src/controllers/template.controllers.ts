import { ExerciseGroupType, PrismaClient, SetType } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Request, Response } from 'express'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { logError, logWarn } from '../utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

interface TemplateSetInput {
	setIndex: number
	setType: SetType
	weight?: number | null
	reps?: number | null
	rpe?: number | null
	durationSeconds?: number | null
	restSeconds?: number | null
	note?: string | null
}

interface TemplateExerciseInput {
	exerciseId: string
	exerciseIndex: number
	exerciseGroupId?: string
	sets: TemplateSetInput[]
}

interface TemplateExerciseGroupInput {
	id: string
	groupType: ExerciseGroupType
	groupIndex: number
	restSeconds?: number
}

interface CreateTemplateBody {
	title: string
	notes?: string
	exercises: TemplateExerciseInput[]
	exerciseGroups?: TemplateExerciseGroupInput[]
}

export const createTemplate = asyncHandler(async (req: Request<object, object, CreateTemplateBody>, res: Response) => {
	const { title, notes, exercises, exerciseGroups } = req.body

	let template: { id: string }

	try {
		await prisma.$transaction(async tx => {
			/* ───── Create Template Header ───── */
			template = await tx.workoutTemplate.create({
				data: {
					userId: req.user!.id,
					title,
					notes,
				},
			})

			/* ───── Create Groups ───── */
			const groupIdMap = new Map<string, string>()

			if (Array.isArray(exerciseGroups) && exerciseGroups.length > 0) {
				const normalized = [...exerciseGroups]
					.sort((a, b) => a.groupIndex - b.groupIndex)
					.map((g, i) => ({ ...g, normalizedIndex: i }))

				for (const group of normalized) {
					const created = await tx.workoutTemplateExerciseGroup.create({
						data: {
							templateId: template.id,
							groupType: group.groupType,
							groupIndex: group.normalizedIndex,
							restSeconds: group.restSeconds ?? null,
						},
					})
					groupIdMap.set(group.id, created.id)
				}
			}

			/* ───── Create Exercises & Sets ───── */
			for (const exercise of exercises) {
				// Verify exercise exists
				const exerciseMeta = await tx.exercise.findUnique({
					where: { id: exercise.exerciseId },
				})

				if (!exerciseMeta) {
					logWarn('Exercise not found for template, skipping', { exerciseId: exercise.exerciseId }, req)
					continue
				}

				const templateExercise = await tx.workoutTemplateExercise.create({
					data: {
						templateId: template.id,
						exerciseId: exercise.exerciseId,
						exerciseIndex: exercise.exerciseIndex,
						exerciseGroupId: exercise.exerciseGroupId
							? (groupIdMap.get(exercise.exerciseGroupId) ?? null)
							: null,
					},
				})

				if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
					await tx.workoutTemplateSet.createMany({
						data: exercise.sets.map(set => ({
							templateExerciseId: templateExercise.id,
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
			}
		})
	} catch (error) {
		logError('Failed to create template', error as Error, { action: 'createTemplate' }, req)
		throw new ApiError(500, 'Failed to create template')
	}

	return res.json(new ApiResponse(201, { template: template! }, 'Template created successfully'))
})

export const getAllTemplates = asyncHandler(async (req: Request, res: Response) => {
	const userId = req.user!.id

	const templates = await prisma.workoutTemplate.findMany({
		where: {
			userId,
			deletedAt: null,
		},
		orderBy: { createdAt: 'desc' },
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
	})

	return res.json(new ApiResponse(200, templates, 'Templates fetched successfully'))
})

export const getTemplateById = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.user!.id
	const templateId = req.params.id

	const template = await prisma.workoutTemplate.findUnique({
		where: { id: templateId },
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
	})

	if (!template || template.userId !== userId) {
		throw new ApiError(404, 'Template not found')
	}

	return res.json(new ApiResponse(200, template, 'Template fetched successfully'))
})

export const deleteTemplate = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.user!.id
	const templateId = req.params.id

	const template = await prisma.workoutTemplate.findUnique({ where: { id: templateId } })

	if (!template || template.userId !== userId) {
		throw new ApiError(404, 'Template not found')
	}

	await prisma.workoutTemplate.update({
		where: { id: templateId },
		data: { deletedAt: new Date() },
	})

	return res.json(new ApiResponse(200, null, 'Template deleted successfully'))
})

export const updateTemplate = asyncHandler(
	async (req: Request<{ id: string }, object, CreateTemplateBody>, res: Response) => {
		const userId = req.user!.id
		const templateId = req.params.id
		const { title, notes, exercises, exerciseGroups } = req.body

		await prisma.$transaction(async tx => {
			const template = await tx.workoutTemplate.findUnique({ where: { id: templateId } })
			if (!template || template.userId !== userId) {
				throw new ApiError(404, 'Template not found')
			}

			if (template.deletedAt) {
				throw new ApiError(404, 'Template not found (deleted)')
			}

			// Delete existing children
			await tx.workoutTemplateExercise.deleteMany({ where: { templateId } })
			await tx.workoutTemplateExerciseGroup.deleteMany({ where: { templateId } })

			// Update Header
			await tx.workoutTemplate.update({
				where: { id: templateId },
				data: { title, notes },
			})

			// Recreate Children (Reuse create logic mostly)
			/* ───── Create Groups ───── */
			const groupIdMap = new Map<string, string>()

			if (Array.isArray(exerciseGroups) && exerciseGroups.length > 0) {
				const normalized = [...exerciseGroups]
					.sort((a, b) => a.groupIndex - b.groupIndex)
					.map((g, i) => ({ ...g, normalizedIndex: i }))

				for (const group of normalized) {
					const created = await tx.workoutTemplateExerciseGroup.create({
						data: {
							templateId: templateId,
							groupType: group.groupType,
							groupIndex: group.normalizedIndex,
							restSeconds: group.restSeconds ?? null,
						},
					})
					groupIdMap.set(group.id, created.id)
				}
			}

			/* ───── Create Exercises & Sets ───── */
			for (const exercise of exercises) {
				const exerciseMeta = await tx.exercise.findUnique({
					where: { id: exercise.exerciseId },
				})

				if (!exerciseMeta) continue

				const templateExercise = await tx.workoutTemplateExercise.create({
					data: {
						templateId: templateId,
						exerciseId: exercise.exerciseId,
						exerciseIndex: exercise.exerciseIndex,
						exerciseGroupId: exercise.exerciseGroupId
							? (groupIdMap.get(exercise.exerciseGroupId) ?? null)
							: null,
					},
				})

				if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
					await tx.workoutTemplateSet.createMany({
						data: exercise.sets.map(set => ({
							templateExerciseId: templateExercise.id,
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
			}
		})

		return res.json(new ApiResponse(200, { id: templateId }, 'Template updated successfully'))
	}
)
