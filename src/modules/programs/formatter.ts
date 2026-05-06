import type { UserProgramResponse } from './types.js'

/**
 * Formats a user program for the frontend, ensuring exercises and groups are properly nested.
 */
export function formatUserProgram(userProgram: any): UserProgramResponse {
  if (!userProgram) return null as any

  const formattedWeeks = userProgram.weeks?.map((week: any) => ({
    ...week,
    days: week.days?.map((day: any) => {
      if (day.templateSnapshot?.exercises) {
        const { exercises = [], exerciseGroups = [] } = day.templateSnapshot.exercises
        return {
          ...day,
          templateSnapshot: { ...day.templateSnapshot, exercises, exerciseGroups },
        }
      }
      return day
    }),
  }))

  const progress = userProgram.progress
  if (progress?.templateSnapshot?.exercises) {
    const { exercises = [], exerciseGroups = [] } = progress.templateSnapshot.exercises
    progress.templateSnapshot = { ...progress.templateSnapshot, exercises, exerciseGroups }
  }

  return { ...userProgram, weeks: formattedWeeks, progress }
}
