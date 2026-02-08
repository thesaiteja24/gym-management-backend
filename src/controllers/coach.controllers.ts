import { Request, Response } from 'express'
import { Readable } from 'stream'
import { generateResponse, synthesizeSpeech } from '../services/coach.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { PrismaClient } from '@prisma/client'
import { ApiResponse } from '../utils/ApiResponse.js'
import { ApiError } from '../utils/ApiError.js'
import prompts from '../utils/coachPrompts.js'

const prisma = new PrismaClient()
const TTS_CACHE: Record<string, Buffer> = {} // in-memory cache for demo (can use Redis or disk)

export const startChat = asyncHandler(async (req: Request, res: Response): Promise<Response> => {
	const userId = req.user!.id

	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) {
		throw new ApiError(404, 'User not found')
	}

	const systemPrompt = prompts.systemPrompt
	const userPrompt = `Generate a brief, friendly greeting introducing yourself and asking how you can help with fitness goals. Keep it to 1-2 sentences. No emojis. Also the name of the user is ${user.firstName?.split(' ').at(-1)}`

	// Generate chat text
	const generatedText = await generateResponse(systemPrompt, userPrompt)

	// Generate TTS MP3
	const ttsResponse = await synthesizeSpeech(generatedText.text)
	if (!ttsResponse) {
		throw new ApiError(500, 'TTS failed')
	}

	const ttsId = crypto.randomUUID() // generate a temporary ID
	TTS_CACHE[ttsId] = ttsResponse.audio // store buffer in memory (or disk/Redis)

	const response = { text: generatedText.text, ttsId: ttsId }

	// Return JSON with text + tts URL
	return res.json(new ApiResponse(200, response, 'Chat started successfully'))
})

export const streamTTS = asyncHandler(async (req: Request<{ id: string }>, res: Response): Promise<void> => {
	const ttsId = req.params.id
	const audioBuffer = TTS_CACHE[ttsId]

	if (!audioBuffer) {
		throw new ApiError(404, 'Audio not found')
	}

	res.setHeader('Content-Type', 'audio/mpeg')
	res.setHeader('Content-Disposition', 'inline; filename="speech.mp3"')
	res.setHeader('Content-Length', audioBuffer.length)

	// Stream the buffer
	const stream = Readable.from(audioBuffer)
	stream.pipe(res)
})
