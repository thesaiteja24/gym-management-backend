import { Request, Response } from 'express'
import { Readable } from 'stream'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import { generateResponse, synthesizeSpeech, transcribeAudio } from '../services/coach.service.js'
import prompts from '../utils/coachPrompts.js'

const prisma = new PrismaClient().$extends(withAccelerate())
const TTS_CACHE: Record<string, Buffer> = {} // in-memory cache for demo (can use Redis or disk)

export const startChat = asyncHandler(async (req: Request, res: Response) => {
	const userId = req.user!.id

	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) {
		logWarn('User not found', { action: 'startChat', userId }, req)
		throw new ApiError(404, 'User not found')
	}

	const systemPrompt = prompts.systemPrompt
	const userPrompt = `Generate a brief, friendly greeting introducing yourself and asking how you can help with fitness goals. Keep it to 1-2 sentences. No emojis. Also the name of the user is ${user.firstName?.split(' ').at(-1)}`

	let generatedText
	try {
		generatedText = await generateResponse(systemPrompt, userPrompt)
	} catch (error) {
		const err = error as Error
		logError('Failed to generate chat response', err, { action: 'startChat', error: err.message }, req)
		throw new ApiError(500, 'Failed to generate chat response')
	}

	let ttsResponse
	try {
		ttsResponse = await synthesizeSpeech(generatedText.text)
	} catch (error) {
		const err = error as Error
		logError('Failed to synthesize speech', err, { action: 'startChat', error: err.message }, req)
		throw new ApiError(500, 'Failed to synthesize speech')
	}

	if (!ttsResponse) {
		logWarn('TTS returned empty response', { action: 'startChat' }, req)
		throw new ApiError(500, 'TTS failed')
	}

	const ttsId = crypto.randomUUID()
	TTS_CACHE[ttsId] = ttsResponse.audio

	const response = { text: generatedText.text, ttsId: ttsId }

	logInfo('Chat started successfully', { action: 'startChat', userId }, req)
	return res.json(new ApiResponse(200, response, 'Chat started successfully'))
})

export const streamTTS = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const ttsId = req.params.id
	const audioBuffer = TTS_CACHE[ttsId]

	if (!audioBuffer) {
		logWarn('Audio not found in cache', { action: 'streamTTS', ttsId }, req)
		throw new ApiError(404, 'Audio not found')
	}

	res.setHeader('Content-Type', 'audio/mpeg')
	res.setHeader('Content-Disposition', 'inline; filename="speech.mp3"')
	res.setHeader('Content-Length', audioBuffer.length)

	logInfo('Streaming TTS audio', { action: 'streamTTS', ttsId }, req)

	const stream = Readable.from(audioBuffer)
	stream.pipe(res)
})

export const askCoach = asyncHandler(async (req: Request, res: Response) => {
	const audioFile = req.file

	if (!audioFile?.buffer) {
		logWarn('Uploaded file buffer missing', { action: 'askCoach' }, req)
		throw new ApiError(400, 'Uploaded file buffer missing')
	}

	logInfo(
		'Audio file received',
		{
			hasFile: !!audioFile,
			bufferExists: !!audioFile?.buffer,
			size: audioFile?.size,
			mimetype: audioFile?.mimetype,
		},
		req
	)

	let transcription
	try {
		transcription = await transcribeAudio(audioFile)
	} catch (error) {
		const err = error as Error
		logError('Failed to transcribe audio', err, { action: 'askCoach', error: err.message }, req)
		throw new ApiError(500, 'Failed to transcribe audio')
	}

	if (!transcription) {
		logWarn('No transcription generated', { action: 'askCoach' }, req)
		throw new ApiError(500, 'Failed to transcribe audio')
	}

	logInfo('Coach response generated', { action: 'askCoach', transcriptLength: transcription.text.length }, req)
	return res.json(new ApiResponse(200, { text: transcription.text }, 'Coach response generated'))
})
