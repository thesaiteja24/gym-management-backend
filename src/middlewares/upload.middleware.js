import multer from 'multer'
import { ApiError } from '../utils/ApiError.js'

export const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
	fileFilter: (req, file, cb) => {
		const allowedMimeType = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'video/mp4']
		if (!allowedMimeType.includes(file.mimetype)) {
			return cb(new ApiError(400, 'Only .png, .jpg, .jpeg and .mp4 formats are allowed'))
		}
		cb(null, true)
	},
})
