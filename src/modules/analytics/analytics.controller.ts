import {
	ActivityLevel,
	EquipmentType,
	FitnessGoal,
	FitnessLevel,
	PrismaClient,
	TargetType,
	UserMeasurement,
} from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { randomUUID } from 'crypto'
import { Request, Response } from 'express'
import {
	deleteMediaByKey,
	extractS3KeyFromUrl,
	UploadedFile,
	uploadMedia,
	uploadVideo,
} from '../../common/services/media.service.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { logDebug, logError } from '../../common/utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

// Helper for buidling Measurment payload to return history and as well as latest and daily weight change
async function buildMeasurementPayload(userId: string, limit = 30) {
	const measurementsHistory = await prisma.userMeasurement.findMany({
		where: { userId },
		orderBy: { date: 'desc' },
		take: limit,
	})

	const latestValues: Partial<MeasurementFields> = {}

	for (const entry of measurementsHistory) {
		const { id, userId: _, date, createdAt, updatedAt, ...measurementFields } = entry

		for (const key in measurementFields) {
			const typedKey = key as keyof MeasurementFields

			if (measurementFields[typedKey] !== null && latestValues[typedKey] === undefined) {
				// @ts-expect-error
				latestValues[typedKey] = measurementFields[typedKey]
			}
		}
	}

	let dailyWeightChange: {
		diff: number
		isPositive: boolean
	} | null = null

	const weightEntries = measurementsHistory.filter(m => m.weight !== null)

	if (weightEntries.length >= 2) {
		const latestWeight = Number(weightEntries[0].weight)
		const previousWeight = Number(weightEntries[1].weight)

		const diff = Math.abs(latestWeight - previousWeight)

		dailyWeightChange = {
			diff,
			isPositive: latestWeight > previousWeight,
		}
	}

	return {
		history: measurementsHistory,
		latestValues,
		dailyWeightChange,
	}
}

interface getFitnessProfileBody {
	fitnessGoal?: FitnessGoal
	fitnessLevel?: FitnessLevel
	activityLevel?: ActivityLevel
	targetType?: TargetType
	targetWeight?: number
	targetBodyFat?: number
	weeklyWeightChange?: number
	targetDate?: string
	injuries?: string
	availableEquipment?: EquipmentType[]
}

export const updateFitnessProfile = asyncHandler(
	async (req: Request<{ id: string }, object, getFitnessProfileBody>, res: Response) => {
		const userId = req.params.id
		const updates = req.body as getFitnessProfileBody

		const transactionCommands = []

		transactionCommands.push(
			prisma.userFitnessProfile.upsert({
				where: { userId },
				update: {
					...(updates.fitnessGoal !== undefined && { fitnessGoal: updates.fitnessGoal }),
					...(updates.fitnessLevel !== undefined && { fitnessLevel: updates.fitnessLevel }),
					...(updates.activityLevel !== undefined && { activityLevel: updates.activityLevel }),
					...(updates.targetType !== undefined && { targetType: updates.targetType }),
					...(updates.targetWeight !== undefined && { targetWeight: updates.targetWeight }),
					...(updates.targetBodyFat !== undefined && { targetBodyFat: updates.targetBodyFat }),
					...(updates.weeklyWeightChange !== undefined && { weeklyWeightChange: updates.weeklyWeightChange }),
					...(updates.targetDate !== undefined && {
						targetDate: updates.targetDate ? new Date(updates.targetDate) : null,
					}),
					...(updates.injuries !== undefined && { injuries: updates.injuries }),
					...(updates.availableEquipment !== undefined && {
						availableEquipment: updates.availableEquipment,
					}),
				},
				create: {
					userId,
					fitnessGoal: updates.fitnessGoal ?? null,
					fitnessLevel: updates.fitnessLevel ?? null,
					activityLevel: updates.activityLevel ?? null,
					targetType: updates.targetType ?? null,
					targetWeight: updates.targetWeight ?? null,
					targetBodyFat: updates.targetBodyFat ?? null,
					weeklyWeightChange: updates.weeklyWeightChange ?? null,
					targetDate: updates.targetDate ? new Date(updates.targetDate) : null,
					injuries: updates.injuries ?? null,
					availableEquipment: updates.availableEquipment ?? [],
				},
			})
		)

		const results = await prisma.$transaction(transactionCommands)

		const updatedFitnessProfile = results[0]

		logDebug('User fitness profile updated successfully', { action: 'updateUserFitnessProfile', user: userId })
		return res
			.status(200)
			.json(
				new ApiResponse(
					200,
					{ ...(updatedFitnessProfile ?? null) },
					'User fitness profile updated successfully '
				)
			)
	}
)

export const getFitnessProfile = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.params.id
	const fitnessProfile = await prisma.userFitnessProfile.findUnique({
		where: { userId },
	})
	logDebug('Fetched user fitness profile', { action: 'getUserFitnessProfile', userId })
	return res.status(200).json(new ApiResponse(200, fitnessProfile, 'User fitness profile fetched successfully'))
})

interface AddMeasurementsBody {
	date: string
	weight?: number
	waist?: number
	bodyFat?: number
	leanBodyMass?: number
	neck?: number
	shoulders?: number
	chest?: number
	leftBicep?: number
	rightBicep?: number
	leftForearm?: number
	rightForearm?: number
	abdomen?: number
	hips?: number
	leftThigh?: number
	rightThigh?: number
	leftCalf?: number
	rightCalf?: number
	notes?: string
}

export const addMeasurements = asyncHandler(
	async (req: Request<{ id: string }, object, AddMeasurementsBody>, res: Response) => {
		const userId = req.params.id
		const {
			date,
			weight,
			bodyFat,
			chest,
			waist,
			neck,
			leanBodyMass,
			shoulders,
			leftBicep,
			rightBicep,
			leftForearm,
			rightForearm,
			abdomen,
			hips,
			leftThigh,
			rightThigh,
			leftCalf,
			rightCalf,
			notes,
		} = req.body

		const parsedDate = new Date(date)
		parsedDate.setUTCHours(0, 0, 0, 0)

		const files = req.files as Express.Multer.File[] | undefined
		const progressPicUrls: string[] = []
		const uploadedKeys: string[] = []

		if (files && files.length > 0) {
			const uploadPromises = files.map(async file => {
				const tempFile: UploadedFile = {
					buffer: file.buffer,
					size: file.size,
					mimetype: file.mimetype,
					originalname: file.originalname,
				}
				const filePath = `gym-sass/measurements/${userId}/${randomUUID()}`

				if (file.mimetype.startsWith('video/')) {
					const uploaded = await uploadVideo({
						file: tempFile,
						mediaType: 'progressVideo',
						filePath,
						userId,
					})
					uploadedKeys.push(uploaded.videoKey)
					return uploaded.videoUrl
				} else {
					const url = await uploadMedia({
						file: tempFile,
						mediaType: 'progressPic',
						filePath,
						userId,
					})
					const key = extractS3KeyFromUrl(url)
					if (key) uploadedKeys.push(key)
					return url
				}
			})

			try {
				const urls = await Promise.all(uploadPromises)
				progressPicUrls.push(...urls)
			} catch (error) {
				const err = error as Error
				for (const key of uploadedKeys) {
					await deleteMediaByKey({ key, userId, reason: 'Failed during multi-upload' })
				}
				logError(
					'Failed to upload daily measurement media',
					err,
					{ action: 'addDailyMeasurement', userId },
					req
				)
				throw new ApiError(500, 'Failed to upload daily measurement media')
			}
		}

		try {
			// Start transaction
			// Start transaction
			const [measurement, updatedUser] = await prisma.$transaction([
				prisma.userMeasurement.upsert({
					where: {
						userId_date: {
							userId,
							date: parsedDate,
						},
					},
					update: {
						...(weight !== undefined && { weight }),
						...(bodyFat !== undefined && { bodyFat }),
						...(chest !== undefined && { chest }),
						...(waist !== undefined && { waist }),
						...(neck !== undefined && { neck }),
						...(leanBodyMass !== undefined && { leanBodyMass }),
						...(shoulders !== undefined && { shoulders }),
						...(leftBicep !== undefined && { leftBicep }),
						...(rightBicep !== undefined && { rightBicep }),
						...(leftForearm !== undefined && { leftForearm }),
						...(rightForearm !== undefined && { rightForearm }),
						...(abdomen !== undefined && { abdomen }),
						...(hips !== undefined && { hips }),
						...(leftThigh !== undefined && { leftThigh }),
						...(rightThigh !== undefined && { rightThigh }),
						...(leftCalf !== undefined && { leftCalf }),
						...(rightCalf !== undefined && { rightCalf }),
						...(notes !== undefined && { notes }),
						...(progressPicUrls.length > 0 && {
							progressPicUrls: { push: progressPicUrls },
						}),
					},
					create: {
						userId,
						date: parsedDate,
						weight: weight ?? null,
						bodyFat: bodyFat ?? null,
						waist: waist ?? null,
						neck: neck ?? null,
						shoulders: shoulders ?? null,
						chest: chest ?? null,
						leftBicep: leftBicep ?? null,
						rightBicep: rightBicep ?? null,
						leftForearm: leftForearm ?? null,
						rightForearm: rightForearm ?? null,
						abdomen: abdomen ?? null,
						hips: hips ?? null,
						leftThigh: leftThigh ?? null,
						rightThigh: rightThigh ?? null,
						leftCalf: leftCalf ?? null,
						rightCalf: rightCalf ?? null,
						notes: notes ?? null,
						progressPicUrls,
					},
				}),
				// Conditionally update user weight if provided
				...(weight !== undefined ? [prisma.user.update({ where: { id: userId }, data: { weight } })] : []),
			])

			logDebug('Added daily measurement and updated user weight', { action: 'addDailyMeasurement', userId })
			const payload = await buildMeasurementPayload(userId)

			return res.status(200).json(new ApiResponse(200, payload, 'Daily measurement saved successfully'))
		} catch (error) {
			const err = error as Error
			// Roll back uploaded media if DB failed
			for (const key of uploadedKeys) {
				await deleteMediaByKey({
					key,
					userId,
					reason: 'daily measurement db update failure',
				})
			}
			logError('Failed to save daily measurement in DB', err, { action: 'addDailyMeasurement', userId }, req)
			throw new ApiError(500, 'Failed to save daily measurement')
		}
	}
)

type MeasurementFields = Omit<UserMeasurement, 'id' | 'userId' | 'date' | 'createdAt' | 'updatedAt'>

export const getMeasurements = asyncHandler(async (req, res) => {
	const userId = req.params.id
	const limit = parseInt(req.query.limit as string) || 30

	const payload = await buildMeasurementPayload(userId, limit)

	return res.status(200).json(new ApiResponse(200, payload, 'Measurements fetched successfully'))
})

interface UpdateNutritionPlanBody {
	caloriesTarget?: number
	proteinTarget?: number
	calculatedTDEE?: number
	deficitOrSurplus?: number
	startDate?: string
}

export const updateNutritionPlan = asyncHandler(
	async (req: Request<{ id: string }, object, UpdateNutritionPlanBody>, res: Response) => {
		const userId = req.params.id
		const updates = req.body as UpdateNutritionPlanBody

		const nutritionPlan = await prisma.userNutritionPlan.upsert({
			where: { userId },
			update: {
				...(updates.caloriesTarget !== undefined && { caloriesTarget: updates.caloriesTarget }),
				...(updates.proteinTarget !== undefined && { proteinTarget: updates.proteinTarget }),
				...(updates.calculatedTDEE !== undefined && { calculatedTDEE: updates.calculatedTDEE }),
				...(updates.deficitOrSurplus !== undefined && { deficitOrSurplus: updates.deficitOrSurplus }),
				...(updates.startDate !== undefined && { startDate: new Date(updates.startDate) }),
			},
			create: {
				userId,
				caloriesTarget: updates.caloriesTarget ?? null,
				proteinTarget: updates.proteinTarget ?? null,
				calculatedTDEE: updates.calculatedTDEE ?? null,
				deficitOrSurplus: updates.deficitOrSurplus ?? null,
				startDate: updates.startDate ? new Date(updates.startDate) : new Date(),
			},
		})
		logDebug('Updated user nutrition plan', { action: 'updateUserNutritionPlan', userId })
		return res.status(200).json(new ApiResponse(200, nutritionPlan, 'User nutrition plan updated successfully'))
	}
)

export const getNutritionPlan = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const userId = req.params.id
	const nutritionPlan = await prisma.userNutritionPlan.findUnique({
		where: { userId },
	})
	logDebug('Fetched user nutrition plan', { action: 'getUsersNutritionPlan', userId })
	return res.status(200).json(new ApiResponse(200, nutritionPlan, 'User nutrition plan fetched successfully'))
})
