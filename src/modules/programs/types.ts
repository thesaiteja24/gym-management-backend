import { FitnessLevel, UserProgramStatus } from '@prisma/client'

// SECTION: MAIN ENTITIES

export interface Program {
  id: string
  clientId: string
  title: string
  description: string | null
  experienceLevel: FitnessLevel
  durationOptions: number[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface UserProgram {
  id: string
  userId: string
  programId: string
  startDate: Date
  durationWeeks: number
  status: UserProgramStatus
  createdAt: Date
  updatedAt: Date
}

// SECTION: PAYLOADS

export interface CreateProgramBody {
  clientId: string
  title: string
  description?: string | null
  experienceLevel: FitnessLevel
  durationOptions: number[]
  weeks: {
    name: string
    weekIndex: number
    days: {
      name: string
      dayIndex: number
      isRestDay: boolean
      templateId?: string | null
    }[]
  }[]
}

export interface UpdateProgramBody {
  title?: string
  description?: string | null
  experienceLevel?: FitnessLevel
  durationOptions?: number[]
  weeks?: {
    name: string
    weekIndex: number
    days: {
      name: string
      dayIndex: number
      isRestDay: boolean
      templateId?: string | null
    }[]
  }[]
}

export interface StartProgramBody {
  duration: number
  startDate?: Date
}

// SECTION: RESPONSES

export interface ProgramResponse extends Program {
  enrolledCount?: number
  enrolledCountLabel?: string
  weeks?: any[]
}

export interface UserProgramResponse extends UserProgram {
  program?: Partial<Program>
  progress?: any
  weeks?: any[]
}
