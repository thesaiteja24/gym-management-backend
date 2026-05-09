import type { EquipmentType, FitnessGoal, FitnessLevel, Gender } from '@prisma/client'
import { prisma, readPrisma } from '../../lib/prisma.js'
import { OpenAI } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { toFile } from 'openai/uploads.js'

import prompts from '../../utils/coachPrompts.js'
import { calculateAge, formatTimeAgo } from '../../utils/helpers.js'


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const FALLBACK_MESSAGE = 'I am having trouble right now. Could you try again in a moment?'

export interface TranscriptionResult {
  text: string
}
export interface GenerateResponseResult {
  text: string
}
export interface SynthesizeSpeechResult {
  text: string
  audio: Buffer
}

export const transcribeAudio = async (
  audioFile: Express.Multer.File,
): Promise<TranscriptionResult> => {
  const file = await toFile(audioFile.buffer, audioFile.originalname || 'audio.m4a', {
    type: audioFile.mimetype,
  })
  const response = await openai.audio.transcriptions.create({
    model: 'gpt-4o-transcribe',
    file,
    response_format: 'json',
  })
  return { text: response.text }
}

export const generateResponse = async (
  messages: ChatCompletionMessageParam[],
): Promise<GenerateResponseResult> => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages,
    max_completion_tokens: 200,
    temperature: 0.7,
  })
  const text = response.choices[0].message.content?.trim() || FALLBACK_MESSAGE
  return { text }
}

export const synthesizeSpeech = async (text: string): Promise<SynthesizeSpeechResult | null> => {
  if (!text?.trim()) return null
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: text,
    response_format: 'mp3',
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  return { text, audio: buffer }
}

function getProfileValue(val: any, unit?: string | null) {
  if (val === undefined || val === null) return 'Unknown'
  return unit ? `${val} ${unit}` : val
}

function formatWorkoutTime(workout: any) {
  if (!workout?.startTime) return 'No workouts recorded'
  return formatTimeAgo(workout.startTime, true)
}

function formatProfileLines(user: any, prof: any, workout: any) {
  return [
    `Gender: ${user.gender || 'Unknown'}`,
    `Age: ${user.dateOfBirth ? calculateAge(user.dateOfBirth) : 'Unknown'}`,
    `Height: ${getProfileValue(user.height, user.preferredLengthUnit || 'cm')}`,
    `Weight: ${getProfileValue(user.weight, user.preferredWeightUnit || 'kg')}`,
    `Fitness level: ${prof.fitnessLevel || 'Unknown'}`,
    `Fitness goal: ${prof.fitnessGoal || 'Unknown'}`,
    `Available equipment: ${prof.availableEquipment?.join(', ') || 'Unknown'}`,
    `Injuries: ${prof.injuries || 'Unknown'}`,
    `Last workout: ${formatWorkoutTime(workout)}`,
  ]
}

export const buildUserFitnessProfile = async (userId: string): Promise<string> => {
  const user = await readPrisma.user.findUnique({
    where: { id: userId },
    select: {
      height: true,
      weight: true,
      dateOfBirth: true,
      gender: true,
      preferredLengthUnit: true,
      preferredWeightUnit: true,
      fitnessProfile: {
        select: { fitnessGoal: true, fitnessLevel: true, injuries: true, availableEquipment: true },
      },
    },
  })
  if (!user) return '--- USER FITNESS PROFILE ---\nNo user found\n--- END PROFILE ---'

  const workout = await readPrisma.workoutLog.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  const prof = user.fitnessProfile || {
    fitnessGoal: null,
    fitnessLevel: null,
    injuries: null,
    availableEquipment: [],
  }

  const lines = formatProfileLines(user, prof, workout)
  return `--- USER FITNESS PROFILE ---\n${lines.join('\n')}\n--- END PROFILE ---`
}

interface ExtractedProfileUpdate {
  gender?: Gender
  height?: { value: number; unit: 'cm' | 'inches' }
  weight?: { value: number; unit: 'kg' | 'lbs' }
  fitnessGoal?: FitnessGoal
  fitnessLevel?: FitnessLevel
  injuries?: string | null
  availableEquipment?: EquipmentType[]
}

export const extractProfileUpdates = async (
  userMessage: string,
): Promise<Partial<ExtractedProfileUpdate>> => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: prompts.extractionPrompt },
        { role: 'user', content: userMessage },
      ],
    })
    return JSON.parse(response.choices[0].message.content?.trim() || '{}')
  } catch (_error) {
    return {}
  }
}

async function updateCoreProfile(userId: string, updates: Partial<ExtractedProfileUpdate>) {
  const { gender, weight, height } = updates

  if (gender) await prisma.user.update({ where: { id: userId }, data: { gender } })

  if (weight) {
    const val = weight.unit === 'lbs' ? weight.value * 0.453592 : weight.value
    await prisma.user.update({ where: { id: userId }, data: { weight: val } })
  }

  if (height) {
    const val = height.unit === 'inches' ? height.value * 2.54 : height.value
    await prisma.user.update({ where: { id: userId }, data: { height: val } })
  }
}

export const applyProfileUpdates = async (
  userId: string,
  updates: Partial<ExtractedProfileUpdate>,
) => {
  await updateCoreProfile(userId, updates)

  const { gender: _, weight: __, height: ___, ...fitnessUpdates } = updates

  if (Object.keys(fitnessUpdates).length > 0) {
    await prisma.userFitnessProfile.upsert({
      where: { userId },
      update: fitnessUpdates,
      create: {
        userId,
        fitnessGoal: fitnessUpdates.fitnessGoal ?? null,
        fitnessLevel: fitnessUpdates.fitnessLevel ?? null,
        injuries: fitnessUpdates.injuries ?? null,
        availableEquipment: fitnessUpdates.availableEquipment ?? [],
      },
    })
  }
}
