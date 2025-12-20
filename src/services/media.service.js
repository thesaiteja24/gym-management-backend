import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import { URL } from 'url'
import { randomUUID } from 'crypto'
import { MEDIA_RULES } from '../../constants/mediaRules.js'
import { optimizeImage } from '../utils/imageOptimizer.js'

const config = {
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
}

const s3 = new S3Client(config)

const BUCKET_NAME = process.env.AWS_S3_BUCKET

export const uploadProfilePicture = async (file, userId) => {
	if (!file) {
		logWarn('No file provided', { action: 'uploadProfilePicture', userId })
		throw new Error('No file provided')
	}

	const rule = MEDIA_RULES.profile

	try {
		if (file.size > rule.limits.maxInputBytes) {
			throw new Error('Profile image too large')
		}

		const optimized = await optimizeImage(file.buffer, rule)

		if (optimized.length > rule.output.maxBytes) {
			throw new Error('Profile image exceeds size limit')
		}

		const key = `gym-sass/user-profile/${randomUUID()}.webp`

		const response = await s3.send(
			new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: key,
				Body: optimized,
				ContentType: 'image/webp',
			})
		)

		logInfo('Profile image uploaded', {
			action: 'uploadProfilePicture',
			userId,
			key,
			size: optimized.length,
			etag: response.ETag,
		})

		return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
	} catch (error) {
		logError('Failed to upload profile image', error, { action: 'uploadProfilePicture', userId }, null)
		throw error
	}
}

export const deleteProfilePicture = async (userId, profilePicUrl) => {
	const path = new URL(profilePicUrl).pathname.substring(1) // Remove leading '/'
	logDebug('Extracted path from URL', { action: 'deleteProfilePic', path: path })
	const key = path

	logDebug('Deleting profile picture', {
		action: 'deleteProfilePic',
		user: userId,
		profilePicUrl: profilePicUrl,
		key: key,
	})

	const params = {
		Bucket: BUCKET_NAME,
		Key: key,
	}

	const headCommand = new HeadObjectCommand(params)
	const command = new DeleteObjectCommand(params)

	try {
		const headResponse = await s3.send(headCommand)
		logDebug('Logging s3 response of head', { action: 'deleteProfilePic', headResponse: headResponse })

		const response = await s3.send(command)
		logDebug('Logging s3 response of delete', { action: 'deleteProfilePic', response: response })
		return true
	} catch (error) {
		if (error.name === 'NotFound') {
			logWarn(
				'File not found in S3, nothing to delete',
				{ action: 'deleteProfilePic', user: userId, key: key },
				null
			)
			throw new Error('Failed to delete file: No file exists with the given key')
		}
		logError('Failed to delete file from S3', error, { action: 'deleteProfilePic', user: userId }, null)
		throw new Error(`Failed to delete file: ${error.message}`)
	}
}

export const uploadMedia = async ({ file, mediaType, filePath, userId }) => {
	if (!file) {
		logWarn('No file provided', { action: 'uploadMedia', userId, mediaType })
		throw new Error('No file provided')
	}

	const rule = MEDIA_RULES[mediaType]

	if (!rule) {
		logWarn('Invalid media type', { action: 'uploadMedia', mediaType })
		throw new Error('Invalid media type')
	}

	try {
		if (file.size > rule.limits.maxInputBytes) {
			throw new Error('Image too large')
		}

		const optimized = await optimizeImage(file.buffer, rule)

		if (optimized.length > rule.output.maxBytes) {
			throw new Error(`${mediaType} image exceeds size limit`)
		}

		const key = `${filePath}.webp`

		const response = await s3.send(
			new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: key,
				Body: optimized,
				ContentType: 'image/webp',
			})
		)

		logInfo('Media uploaded', {
			action: 'uploadMedia',
			userId,
			mediaType,
			key,
			size: optimized.length,
			etag: response.ETag,
		})

		return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
	} catch (error) {
		logError('Failed to upload media', error, { action: 'uploadMedia', userId, mediaType, filePath }, null)
		throw error
	}
}
