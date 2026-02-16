import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import { URL } from 'url'
import { randomUUID } from 'crypto'
import { MEDIA_RULES, ImageMediaRule, VideoMediaRule } from '../constants/mediaRules.js'
import { optimizeImage } from '../utils/imageOptimizer.js'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

interface S3Config {
	region: string | undefined
	credentials: {
		accessKeyId: string | undefined
		secretAccessKey: string | undefined
	}
}

const s3 = new S3Client({
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
	},
})

const BUCKET_NAME = process.env.AWS_S3_BUCKET!

export interface UploadedFile {
	buffer: Buffer
	size: number
	mimetype: string
	originalname: string
}

export const extractS3KeyFromUrl = (url: string | null | undefined): string | null => {
	if (!url) return null
	return new URL(url).pathname.substring(1)
}

export const uploadProfilePicture = async (file: UploadedFile, userId: string): Promise<string> => {
	if (!file) {
		logWarn('No file provided', { action: 'uploadProfilePicture', userId })
		throw new Error('No file provided')
	}

	const rule = MEDIA_RULES.profile as ImageMediaRule

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
		logError('Failed to upload profile image', error as Error, { action: 'uploadProfilePicture', userId }, null)
		throw error
	}
}

export const deleteProfilePicture = async (userId: string, profilePicUrl: string): Promise<boolean> => {
	const urlPath = new URL(profilePicUrl).pathname.substring(1) // Remove leading '/'
	logDebug('Extracted path from URL', { action: 'deleteProfilePic', path: urlPath })
	const key = urlPath

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
		const err = error as Error & { name?: string }
		if (err.name === 'NotFound') {
			logWarn(
				'File not found in S3, nothing to delete',
				{ action: 'deleteProfilePic', user: userId, key: key },
				null
			)
			throw new Error('Failed to delete file: No file exists with the given key')
		}
		logError('Failed to delete file from S3', err, { action: 'deleteProfilePic', user: userId }, null)
		throw new Error(`Failed to delete file: ${err.message}`)
	}
}

interface UploadMediaParams {
	file: UploadedFile
	mediaType: string
	filePath: string
	userId: string
}

export const uploadMedia = async ({ file, mediaType, filePath, userId }: UploadMediaParams): Promise<string> => {
	if (!file) {
		logWarn('No file provided', { action: 'uploadMedia', userId, mediaType })
		throw new Error('No file provided')
	}

	const rule = MEDIA_RULES[mediaType] as ImageMediaRule

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
		logError('Failed to upload media', error as Error, { action: 'uploadMedia', userId, mediaType, filePath }, null)
		throw error
	}
}

interface DeleteMediaParams {
	key: string
	userId: string
	reason: string
}

export const deleteMediaByKey = async ({ key, userId, reason }: DeleteMediaParams): Promise<void> => {
	try {
		await s3.send(
			new DeleteObjectCommand({
				Bucket: BUCKET_NAME,
				Key: key,
			})
		)

		logInfo('Rolled back media upload', {
			action: 'deleteMediaByKey',
			userId,
			key,
			reason,
		})
	} catch (error) {
		// Rollback failure should NEVER crash the request
		logError(
			'Failed to rollback media upload',
			error as Error,
			{ action: 'deleteMediaByKey', userId, key, reason },
			null
		)
	}
}

const execFileAsync = promisify(execFile)

interface UploadExerciseVideoParams {
	file: UploadedFile
	filePath: string
	userId: string
}

interface ExerciseVideoUploadResult {
	videoUrl: string
	thumbnailUrl: string
	videoKey: string
	thumbnailKey: string
}

export const uploadExerciseVideo = async ({
	file,
	filePath,
	userId,
}: UploadExerciseVideoParams): Promise<ExerciseVideoUploadResult> => {
	if (!file) {
		logWarn('No file provided', { action: 'uploadExerciseVideo', userId })
		throw new Error('No file provided')
	}

	const videoRule = MEDIA_RULES.exerciseVideo as VideoMediaRule
	const thumbnailRule = MEDIA_RULES.exerciseThumbnail as ImageMediaRule

	if (file.size > videoRule.limits.maxInputBytes) {
		throw new Error('Exercise video exceeds size limit')
	}

	const tempDir = '/tmp'
	// temporary path for uploaded video
	const inputPath = path.join(tempDir, `${randomUUID()}-input.mp4`)
	// temporary path for uploaded video after metadata cleaning
	const cleanedPath = path.join(tempDir, `${randomUUID()}-cleaned.mp4`)
	// temporary path for generated thumbnail
	const thumbnailPath = path.join(tempDir, `${randomUUID()}-thumbnail.webp`)

	try {
		// Write the uploaded file to a temp input location
		await fs.writeFile(inputPath, file.buffer)

		// Clean metadata from video and store in cleanedPath
		await execFileAsync('ffmpeg', ['-i', inputPath, '-map_metadata', '-1', '-c', 'copy', cleanedPath])

		// Generate thumbnail and store in thumbnailPath
		await execFileAsync('ffmpeg', [
			'-ss',
			String(videoRule.output.thumbnailAtSeconds),
			'-i',
			cleanedPath,
			'-frames:v',
			'1',
			thumbnailPath,
		])

		// Optimize thumbnail
		const frameBuffer = await fs.readFile(thumbnailPath)
		const optimizedThumbnail = await optimizeImage(frameBuffer, thumbnailRule) // gives webp buffer

		if (optimizedThumbnail.length > thumbnailRule.output.maxBytes) {
			throw new Error('Thumbnail exceeds size limit')
		}

		// Generate S3 keys
		const videoKey = `${filePath}.mp4`
		const thumbnailKey = `${filePath}.webp`

		// read cleaned video file into buffer
		const videoBuffer = await fs.readFile(cleanedPath)

		// Upload cleaned video
		const videoUploadResponse = await s3.send(
			new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: videoKey,
				Body: videoBuffer,
				ContentType: 'video/mp4',
			})
		)

		// Upload thumbnail
		const thumbnailUploadResponse = await s3.send(
			new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: thumbnailKey,
				Body: optimizedThumbnail,
				ContentType: 'image/webp',
			})
		)

		logInfo('Exercise video and thumbnail uploaded', {
			action: 'uploadExerciseVideo',
			userId,
			videoKey,
			videoSize: videoBuffer.length,
			videoEtag: videoUploadResponse.ETag,
			thumbnailKey,
			thumbnailSize: optimizedThumbnail.length,
			thumbnailEtag: thumbnailUploadResponse.ETag,
		})

		return {
			videoUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${videoKey}`,
			thumbnailUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${thumbnailKey}`,
			videoKey,
			thumbnailKey,
		}
	} catch (error) {
		logError(
			'Failed to upload exercise video',
			error as Error,
			{ action: 'uploadExerciseVideo', userId, filePath },
			null
		)
		throw error
	} finally {
		await fs.unlink(inputPath).catch(() => {})
		await fs.unlink(cleanedPath).catch(() => {})
		await fs.unlink(thumbnailPath).catch(() => {})
	}
}
