import { OpenAI } from 'openai'

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

const FALLBACK_MESSAGE = 'I am having trouble right now. Could you try again in a moment?'

export const transcribeAudio = async (audioFile: File) => {}

export const generateResponse = async (systemPrompt: string, userPrompt: string): Promise<{ text: string }> => {
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

		return { text: text }
	} catch (error) {
		console.error('Error transcribing audio:', error)
		return { text: FALLBACK_MESSAGE }
	}
}

export const synthesizeSpeech = async (text: string) => {
	try {
		const response = await openai.audio.speech.create({
			model: 'tts-1',
			voice: 'alloy',
			input: text,
			response_format: 'mp3',
		})

		const buffer = Buffer.from(await response.arrayBuffer())

		return { text: text, audio: buffer }
	} catch (error) {
		console.error('Error synthesizing speech:', error)
		return null
	}
}
