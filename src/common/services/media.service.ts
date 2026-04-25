import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { URL } from 'url'
import { promisify } from 'util'

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'

import type { ImageMediaRule, VideoMediaRule } from '../constants/mediaRules.js'
import { MEDIA_RULES } from '../constants/mediaRules.js'
import { optimizeImage } from '../utils/imageOptimizer.js'

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

export const uploadProfilePicture = async (file: UploadedFile, _userId: string): Promise<string> => {
  if (!file) {
    throw new Error('No file provided')
  }

  const rule = MEDIA_RULES.profile as ImageMediaRule

  if (file.size > rule.limits.maxInputBytes) {
    throw new Error('Profile image too large')
  }

  const optimized = await optimizeImage(file.buffer, rule)

  if (optimized.length > rule.output.maxBytes) {
    throw new Error('Profile image exceeds size limit')
  }

  const key = `gym-sass/user-profile/${randomUUID()}.webp`

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: optimized,
      ContentType: 'image/webp',
    }),
  )

  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
}

export const deleteProfilePicture = async (
  _userId: string,
  profilePicUrl: string,
): Promise<boolean> => {
  const urlPath = new URL(profilePicUrl).pathname.substring(1) // Remove leading '/'
  const key = urlPath

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  }

  const headCommand = new HeadObjectCommand(params)
  const command = new DeleteObjectCommand(params)

  try {
    await s3.send(headCommand)
    await s3.send(command)
    return true
  } catch (error) {
    const err = error as Error & { name?: string }
    if (err.name === 'NotFound') {
      throw new Error('Failed to delete file: No file exists with the given key', { cause: error })
    }
    throw new Error(`Failed to delete file: ${err.message}`, { cause: error })
  }
}

interface UploadMediaParams {
  file: UploadedFile
  mediaType: string
  filePath: string
  userId: string
}

export const uploadMedia = async ({
  file,
  mediaType,
  filePath,
}: UploadMediaParams): Promise<string> => {
  if (!file) {
    throw new Error('No file provided')
  }

  const rule = MEDIA_RULES[mediaType] as ImageMediaRule

  if (!rule) {
    throw new Error('Invalid media type')
  }

  if (file.size > rule.limits.maxInputBytes) {
    throw new Error('Image too large')
  }

  const optimized = await optimizeImage(file.buffer, rule)

  if (optimized.length > rule.output.maxBytes) {
    throw new Error(`${mediaType} image exceeds size limit`)
  }

  const key = `${filePath}.webp`

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: optimized,
      ContentType: 'image/webp',
    }),
  )

  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
}

interface DeleteMediaParams {
  key: string
  userId: string
  reason: string
}

export const deleteMediaByKey = async ({
  key,
}: DeleteMediaParams): Promise<void> => {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    )
  } catch (_error) {
    // Rollback failure silent for now as requested
  }
}

interface UploadVideoParams {
  file: UploadedFile
  mediaType: string
  filePath: string
  userId: string
}

interface VideoUploadResult {
  videoUrl: string
  videoKey: string
}

export const uploadVideo = async ({
  file,
  mediaType,
  filePath,
}: UploadVideoParams): Promise<VideoUploadResult> => {
  if (!file) {
    throw new Error('No file provided')
  }

  const videoRule = MEDIA_RULES[mediaType] as VideoMediaRule

  if (!videoRule || videoRule.kind !== 'video') {
    throw new Error('Invalid media type for video')
  }

  if (file.size > videoRule.limits.maxInputBytes) {
    throw new Error(`${mediaType} video exceeds size limit`)
  }

  const tempDir = '/tmp'
  const inputPath = path.join(tempDir, `${randomUUID()}-input.mp4`)
  const cleanedPath = path.join(tempDir, `${randomUUID()}-cleaned.mp4`)

  try {
    await fs.writeFile(inputPath, file.buffer)

    if (videoRule.output.stripMetadata) {
      await execFileAsync('ffmpeg', [
        '-i',
        inputPath,
        '-map_metadata',
        '-1',
        '-c',
        'copy',
        cleanedPath,
      ])
    } else {
      await fs.copyFile(inputPath, cleanedPath)
    }

    const videoKey = `${filePath}.${videoRule.output.format}`
    const videoBuffer = await fs.readFile(cleanedPath)

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: videoKey,
        Body: videoBuffer,
        ContentType: `video/${videoRule.output.format}`,
      }),
    )

    return {
      videoUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${videoKey}`,
      videoKey,
    }
  } finally {
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(cleanedPath).catch(() => {})
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
}: UploadExerciseVideoParams): Promise<ExerciseVideoUploadResult> => {
  if (!file) {
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
    await execFileAsync('ffmpeg', [
      '-i',
      inputPath,
      '-map_metadata',
      '-1',
      '-c',
      'copy',
      cleanedPath,
    ])

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
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: videoKey,
        Body: videoBuffer,
        ContentType: 'video/mp4',
      }),
    )

    // Upload thumbnail
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: thumbnailKey,
        Body: optimizedThumbnail,
        ContentType: 'image/webp',
      }),
    )

    return {
      videoUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${videoKey}`,
      thumbnailUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${thumbnailKey}`,
      videoKey,
      thumbnailKey,
    }
  } finally {
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(cleanedPath).catch(() => {})
    await fs.unlink(thumbnailPath).catch(() => {})
  }
}
