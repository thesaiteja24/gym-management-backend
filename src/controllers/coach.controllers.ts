import { Request, Response } from 'express'
import { Readable } from 'stream'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js'
import {
	buildUserFitnessProfile,
	generateResponse,
	synthesizeSpeech,
	transcribeAudio,
} from '../services/coach.service.js'
import { getCache, setCache } from '../services/caching.service.js'
import { ChatCompletionMessageParam } from 'openai/resources'
import prompts from '../utils/coachPrompts.js'
import NodeCache from 'node-cache'
import { calculateAge, formatTimeAgo } from '../utils/helpers.js'

const prisma = new PrismaClient().$extends(withAccelerate())

const ttsCache = new NodeCache({
	stdTTL: 300, // 5 minutes
	checkperiod: 60, // cleanup every minute
	useClones: false, // important for Buffers
})

const CONVERSATION_CACHE_TTL = '24hr'

export const startConversation = asyncHandler(async (req: Request, res: Response) => {
	const userId = req.user!.id

	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) {
		logWarn('User not found', { action: 'startChat', userId }, req)
		throw new ApiError(404, 'User not found')
	}

	const cacheKey = `coach:conversations:${userId}`
	const name = user.firstName?.split(' ').at(-1)

	const userFitnessProfile = await buildUserFitnessProfile(userId)
	const greetings = name ? prompts.greetingPrompt(name) : prompts.greetingPrompt()

	const systemPrompt = prompts.systemPrompt
	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt },
		{ role: 'system', content: userFitnessProfile },
		{ role: 'user', content: greetings },
	]
	let generatedText
	try {
		generatedText = await generateResponse(messages)
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
	ttsCache.set(ttsId, ttsResponse.audio)

	// Only store the assistant's greeting in history (not the internal instruction prompt)
	try {
		await setCache(cacheKey, [{ role: 'assistant', content: generatedText.text }], CONVERSATION_CACHE_TTL)
	} catch (error) {
		const err = error as Error
		logError('Failed to set conversation in cache', err, { action: 'startChat', error: err.message }, req)
	}

	const response = { id: userId, text: generatedText.text, ttsId: ttsId }

	logInfo('Chat started successfully', { action: 'startChat', userId }, req)
	return res.json(new ApiResponse(200, response, 'Chat started successfully'))
})

export const streamSpeech = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
	const ttsId = req.params.id
	const audioBuffer = ttsCache.get<Buffer>(ttsId)

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

export const transcribeMessage = asyncHandler(async (req: Request, res: Response) => {
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

	if (!transcription || !transcription.text.trim()) {
		logWarn('No transcription generated or empty audio', { action: 'askCoach' }, req)
		throw new ApiError(400, 'Could not understand audio. Please try again.')
	}

	logInfo('Audio transcribed', { action: 'askCoach', transcriptLength: transcription.text.length }, req)
	return res.json(new ApiResponse(200, { text: transcription.text }, 'Audio transcribed'))
})

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
	const userId = req.params.id
	const { question } = req.body

	if (req.user?.id !== userId) {
		logWarn('User ID mismatch', { action: 'answerQuestion' }, req)
		throw new ApiError(400, 'User ID mismatch')
	}

	if (!question || typeof question !== 'string' || !question.trim()) {
		logWarn('Question missing or invalid', { action: 'answerQuestion', questionType: typeof question }, req)
		throw new ApiError(400, 'Question is required and must be a non-empty string')
	}

	const cacheKey = `coach:conversations:${req.user!.id}`
	const history = (await getCache<ChatCompletionMessageParam[]>(cacheKey)) ?? []
	const userFitnessProfile = await buildUserFitnessProfile(req.user!.id)

	// Add the new user question to history
	history.push({ role: 'user', content: question.trim() })

	// Build model input: system prompt + recent history (excluding any stale system prompts)
	const filteredHistory = history.filter(msg => msg.role === 'user' || msg.role === 'assistant').slice(-12)

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: prompts.systemPrompt },
		{ role: 'system', content: userFitnessProfile },
		...filteredHistory,
	]

	let generatedText
	try {
		generatedText = await generateResponse(messages)
	} catch (error) {
		const err = error as Error
		logError('Failed to generate chat response', err, { action: 'answerQuestion', error: err.message }, req)
		throw new ApiError(500, 'Failed to generate chat response')
	}

	if (!generatedText) {
		logWarn('No response generated', { action: 'answerQuestion' }, req)
		throw new ApiError(500, 'Failed to generate chat response')
	}

	let ttsResponse
	try {
		ttsResponse = await synthesizeSpeech(generatedText.text)
	} catch (error) {
		const err = error as Error
		logError('Failed to synthesize speech', err, { action: 'answer', error: err.message }, req)
		throw new ApiError(500, 'Failed to synthesize speech')
	}

	if (!ttsResponse) {
		logWarn('TTS returned empty response', { action: 'answerQuestion' }, req)
		throw new ApiError(500, 'TTS failed')
	}

	const ttsId = crypto.randomUUID()
	ttsCache.set(ttsId, ttsResponse.audio)

	history.push({ role: 'assistant', content: generatedText.text })

	try {
		await setCache(cacheKey, history, CONVERSATION_CACHE_TTL)
	} catch (error) {
		const err = error as Error
		logError('Failed to cache history', err, { action: 'answerQuestion', error: err.message }, req)
	}

	logInfo('Coach response generated', { action: 'answerQuestion', transcriptLength: generatedText.text.length }, req)
	return res.json(new ApiResponse(200, { text: generatedText.text, ttsId }, 'Coach response generated'))
})

export const getActiveConversation = asyncHandler(async (req: Request, res: Response) => {
	const userId = req.user!.id

	const cacheKey = `coach:conversations:${userId}`

	if (!userId) {
		logInfo('Unauthorized to fetch active conversation', { userId }, req)
		throw new ApiError(401, 'Unauthorized to fetch active conversation')
	}

	const history = (await getCache<ChatCompletionMessageParam[]>(cacheKey)) ?? []

	if (history.length === 0) {
		logInfo('No active conversation', { id: userId }, req)
		return res.json(new ApiResponse(200, null, 'No active conversation'))
	}

	logInfo('Active conversation fetched', { id: userId, history }, req)

	return res.json(
		new ApiResponse(200, {
			id: userId,
			messages: history,
		})
	)
})
