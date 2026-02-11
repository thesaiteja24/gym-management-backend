import { OpenAI } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { toFile } from 'openai/uploads.js'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { calculateAge, formatTimeAgo } from '../utils/helpers.js'

const prisma = new PrismaClient().$extends(withAccelerate())

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

const FALLBACK_MESSAGE = 'I am having trouble right now. Could you try again in a moment?'

interface TranscriptionResult {
	text: string
}

interface GenerateResponseResult {
	text: string
}

interface SynthesizeSpeechResult {
	text: string
	audio: Buffer
}

export const transcribeAudio = async (audioFile: Express.Multer.File): Promise<TranscriptionResult> => {
	try {
		const file = await toFile(audioFile.buffer, audioFile.originalname || 'audio.m4a', {
			type: audioFile.mimetype,
		})

		const response = await openai.audio.transcriptions.create({
			model: 'gpt-4o-transcribe',
			file: file,
			response_format: 'json',
		})

		logInfo('Audio transcription successful', {
			action: 'transcribeAudio',
			textLength: response.text.length,
		})

		return { text: response.text }
	} catch (error) {
		const err = error as Error
		logError('Failed to transcribe audio', err, { action: 'transcribeAudio', error: err.message }, null)
		throw error
	}
}

export const generateResponse = async (messages: ChatCompletionMessageParam[]): Promise<GenerateResponseResult> => {
	try {
		const response = await openai.chat.completions.create({
			model: 'gpt-4.1',
			messages: messages,
			max_completion_tokens: 200,
			temperature: 0.7,
		})

		const text = response.choices[0].message.content?.trim() || FALLBACK_MESSAGE

		logInfo('Chat response generated', {
			action: 'generateResponse',
			textLength: text.length,
			model: 'gpt-4.1',
		})

		return { text }
	} catch (error) {
		const err = error as Error
		logError('Failed to generate chat response', err, { action: 'generateResponse', error: err.message }, null)
		throw error
	}
}

export const synthesizeSpeech = async (text: string): Promise<SynthesizeSpeechResult | null> => {
	if (!text || text.trim().length === 0) {
		logWarn('Empty text provided for speech synthesis', { action: 'synthesizeSpeech' }, null)
		return null
	}

	try {
		const response = await openai.audio.speech.create({
			model: 'tts-1',
			voice: 'alloy',
			input: text,
			response_format: 'mp3',
		})

		const buffer = Buffer.from(await response.arrayBuffer())

		logInfo('Speech synthesized successfully', {
			action: 'synthesizeSpeech',
			textLength: text.length,
			audioSize: buffer.length,
			model: 'tts-1',
			voice: 'alloy',
		})

		return { text, audio: buffer }
	} catch (error) {
		const err = error as Error
		logError('Failed to synthesize speech', err, { action: 'synthesizeSpeech', error: err.message }, null)
		throw error
	}
}

export const buildUserFitnessProfile = async (userId: string): Promise<string> => {
	const userContext = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			height: true,
			weight: true,
			dateOfBirth: true,
			preferredLengthUnit: true,
			preferredWeightUnit: true,
			fitnessProfile: {
				select: {
					fitnessGoal: true,
					fitnessLevel: true,
					injuries: true,
					availableEquipment: true,
				},
			},
		},
	})

	const workoutContext = await prisma.workoutLog.findFirst({
		where: { userId: userId },
		select: {
			startTime: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: {
			createdAt: 'desc',
		},
	})

	const userFitnessProfile = `--- USER FITNESS PROFILE ---
Fitness level: ${userContext?.fitnessProfile?.fitnessLevel ?? 'Unknown'}
Fitness goal: ${userContext?.fitnessProfile?.fitnessGoal ?? 'Unknown'}
Available equipment: ${
		userContext?.fitnessProfile?.availableEquipment?.length
			? userContext.fitnessProfile.availableEquipment.join(', ')
			: 'Unknown'
	}
Injuries: ${userContext?.fitnessProfile?.injuries ? userContext.fitnessProfile.injuries : 'Unknown'}
Weight: ${
		userContext?.weight && userContext?.preferredWeightUnit
			? `${userContext.weight} ${userContext.preferredWeightUnit}`
			: 'Unknown'
	}
Height: ${
		userContext?.height && userContext?.preferredLengthUnit
			? `${userContext.height} ${userContext.preferredLengthUnit}`
			: 'Unknown'
	}
Age: ${userContext?.dateOfBirth ? calculateAge(userContext.dateOfBirth) : 'Unknown'}
Last workout: ${workoutContext?.startTime ? formatTimeAgo(workoutContext.startTime, true) : 'No workouts recorded'}
--- END PROFILE ---
`

	return userFitnessProfile
}
