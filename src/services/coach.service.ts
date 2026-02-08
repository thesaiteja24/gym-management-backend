import { OpenAI } from 'openai'
import { logError, logInfo, logWarn } from '../utils/logger.js'
import { toFile } from 'openai/uploads.js'

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
			model: 'whisper-1',
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

export const generateResponse = async (systemPrompt: string, userPrompt: string): Promise<GenerateResponseResult> => {
	try {
		const response = await openai.chat.completions.create({
			model: 'gpt-4.1',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
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
