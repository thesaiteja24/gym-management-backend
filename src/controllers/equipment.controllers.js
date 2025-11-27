import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '../generated/prisma/client.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { uploadMedia } from '../services/media.service.js'
import { logInfo, logWarn } from '../utils/logger.js'
import { titleizeString } from '../utils/helpers.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export const createEquipment = asyncHandler(async (req, res) => {
	const { title } = req.body
	const image = req.file
	const filePath = `gym-sass/equipment/${title.toLowerCase()}`

	if (!title) {
		logWarn('Title is required to create Equipment', { action: 'createEquipment' }, req)
		throw new ApiError(400, 'Title is required')
	}

	if (!image) {
		logWarn('Image file is required to create Equipment', { action: 'createEquipment' }, req)
		throw new ApiError(400, 'Image file is required')
	}

	let thumbnailUrl = ''
	try {
		thumbnailUrl = await uploadMedia(filePath, image)
	} catch (error) {
		logWarn('Failed to upload Equipment Image', { action: 'createEquipment', error: error.message }, req)
		throw new ApiError(500, 'Failed to upload Equipment Image', error.message)
	}

	try {
		const newEquipment = await prisma.equipment.create({
			data: { title: titleizeString(title), thumbnailUrl },
		})
		logInfo('Equipment created successfully', { action: 'createEquipment', equipmentId: newEquipment.id }, req)
		return res.json(new ApiResponse(200, newEquipment, 'Equipment created successfully'))
	} catch (error) {
		if (error.code === 'P2002') {
			logWarn(
				'Equipment with this title already exists',
				{ action: 'createEquipment', error: error.message },
				req
			)
			throw new ApiError(400, 'Equipment with this title already exists', error.message)
		}
		throw new ApiError(500, 'Failed to create Equipment', error.message)
	}
})
