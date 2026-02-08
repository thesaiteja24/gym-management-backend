import multer, { FileFilterCallback } from 'multer'
import { Request } from 'express'
import { ApiError } from '../utils/ApiError.js'

export const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
	fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
		const allowedMimeType = [
			'image/jpeg',
			'image/png',
			'image/jpg',
			'image/webp',
			'video/mp4',

			// audio formats
			'audio/mp4',
			'audio/m4a',
			'audio/mpeg',
			'audio/wav',
			'audio/webm',
		]

		if (!allowedMimeType.includes(file.mimetype)) {
			return cb(new ApiError(400, 'Only .png, .jpg, .jpeg, .mp4 and .m4a formats are allowed'))
		}
		cb(null, true)
	},
})
