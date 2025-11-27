import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import path from 'path'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import { URL } from 'url'

const config = {
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
}

const s3 = new S3Client(config)

const BUCKET_NAME = process.env.AWS_S3_BUCKET

export const uploadProfilePicture = async (userId, file) => {
	if (!file) {
		throw new Error('No file provided')
	}

	const extension = path.extname(file.originalname) || '.jpg'
	const key = `gym-sass/user-profile/${userId}${extension}`

	const params = {
		Body: file.buffer,
		Bucket: BUCKET_NAME,
		ContentType: file.mimetype,
		Key: key,
	}

	const command = new PutObjectCommand(params)

	try {
		const response = await s3.send(command)
		logDebug('Logging s3 response of upload', { action: 'updateProfilePic', response: response })
		const url = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`

		logInfo('Profile Image uploaded', { action: 'updateProfilePic', url: url })
		return url
	} catch (error) {
		logError('Failed to upload file to S3', error, { action: 'updateProfilePic', user: userId }, null)
		throw new Error(`Failed to upload file: ${error.message}`)
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

export const uploadMedia = async (filePath, file) => {
	if (!file) {
		throw new Error('No file provided')
	}

	const extension = path.extname(file.originalname) || '.jpg'
	const key = filePath + extension

	const params = {
		Body: file.buffer,
		Bucket: BUCKET_NAME,
		ContentType: file.mimetype,
		Key: key,
	}

	const command = new PutObjectCommand(params)

	try {
		const response = await s3.send(command)
		logDebug('Logging s3 reponse of upload', { action: 'uploadMedia', reponse: response })
		const url = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`

		logInfo('Media Uploaded', { action: 'uploadMedia', url: url })
		return url
	} catch (error) {
		logError('Failed to upload file to S3', error, { action: 'uploadMedia' }, null)
		throw new Error(`Failed to upload file: ${error.message}`)
	}
}
