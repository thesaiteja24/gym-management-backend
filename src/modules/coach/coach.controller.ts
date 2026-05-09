import { Readable } from 'stream'

import { prisma } from '../../lib/prisma.js'
import type { Request, Response } from 'express'
import NodeCache from 'node-cache'
import type { ChatCompletionMessageParam } from 'openai/resources'

import { getCache, setCache } from '../../service/caching.service.js'
import { ApiError } from '../../utils/ApiError.js'
import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import prompts from '../../utils/coachPrompts.js'

import {
  applyProfileUpdates,
  buildUserFitnessProfile,
  extractProfileUpdates,
  generateResponse,
  synthesizeSpeech,
  transcribeAudio,
} from './coach.service.js'



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
  } catch (_error) {
    throw new ApiError(500, 'Failed to generate chat response')
  }

  let ttsResponse
  try {
    ttsResponse = await synthesizeSpeech(generatedText.text)
  } catch (_error) {
    throw new ApiError(500, 'Failed to synthesize speech')
  }

  if (!ttsResponse) {
    throw new ApiError(500, 'TTS failed')
  }

  const ttsId = crypto.randomUUID()
  ttsCache.set(ttsId, ttsResponse.audio)

  // Only store the assistant's greeting in history (not the internal instruction prompt)
  try {
    await setCache(
      cacheKey,
      [{ role: 'assistant', content: generatedText.text }],
      CONVERSATION_CACHE_TTL,
    )
  } catch (_error) {
    // Silent failure for cache
  }

  const response = { id: userId, text: generatedText.text, ttsId: ttsId }

  return res.json(new ApiResponse(200, response, 'Chat started successfully'))
})

export const streamSpeech = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const ttsId = req.params.id
  const audioBuffer = ttsCache.get<Buffer>(ttsId)

  if (!audioBuffer) {
    throw new ApiError(404, 'Audio not found')
  }

  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Content-Disposition', 'inline; filename="speech.mp3"')
  res.setHeader('Content-Length', audioBuffer.length)

  const stream = Readable.from(audioBuffer)
  stream.pipe(res)
})

export const transcribeMessage = asyncHandler(async (req: Request, res: Response) => {
  const audioFile = req.file

  if (!audioFile?.buffer) {
    throw new ApiError(400, 'Uploaded file buffer missing')
  }

  let transcription
  try {
    transcription = await transcribeAudio(audioFile)
  } catch (_error) {
    throw new ApiError(500, 'Failed to transcribe audio')
  }

  if (!transcription || !transcription.text.trim()) {
    throw new ApiError(400, 'Could not understand audio. Please try again.')
  }

  return res.json(new ApiResponse(200, { text: transcription.text }, 'Audio transcribed'))
})

async function handleProfileUpdates(userId: string, question: string) {
  const extractedDetails = await extractProfileUpdates(question.trim())
  if (Object.keys(extractedDetails).length > 0) {
    await applyProfileUpdates(userId, extractedDetails)
  }
}

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id as string
  const { question } = req.body

  if (req.user?.id !== userId) throw new ApiError(400, 'User ID mismatch')
  if (!question || typeof question !== 'string' || !question.trim()) {
    throw new ApiError(400, 'Question is required and must be a non-empty string')
  }

  const cacheKey = `coach:conversations:${userId}`
  const history = (await getCache<ChatCompletionMessageParam[]>(cacheKey)) ?? []
  history.push({ role: 'user', content: question.trim() })

  await handleProfileUpdates(userId, question)

  const userFitnessProfile = await buildUserFitnessProfile(userId)
  const filteredHistory = history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .slice(-12)

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: `${prompts.systemPrompt}\n${userFitnessProfile}` },
    ...filteredHistory,
  ]

  const generatedText = await generateResponse(messages)
  const ttsResponse = await synthesizeSpeech(generatedText.text)
  if (!ttsResponse) throw new ApiError(500, 'TTS failed')

  const ttsId = crypto.randomUUID()
  ttsCache.set(ttsId, ttsResponse.audio)

  history.push({ role: 'assistant', content: generatedText.text })
  await setCache(cacheKey, history, CONVERSATION_CACHE_TTL).catch(() => {})

  return res.json(
    new ApiResponse(200, { text: generatedText.text, ttsId }, 'Coach response generated'),
  )
})

export const getActiveConversation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id

  const cacheKey = `coach:conversations:${userId}`

  if (!userId) {
    throw new ApiError(401, 'Unauthorized to fetch active conversation')
  }

  const history = (await getCache<ChatCompletionMessageParam[]>(cacheKey)) ?? []

  if (history.length === 0) {
    return res.json(new ApiResponse(200, null, 'No active conversation'))
  }

  return res.json(
    new ApiResponse(200, {
      id: userId,
      messages: history,
    }),
  )
})
