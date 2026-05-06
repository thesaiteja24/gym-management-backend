/**
 * Extracts latest non-null values for each measurement metric.
 */
export function extractLatestValues(history: any[]) {
  const latestValues: any = {}
  for (const entry of history) {
    for (const key in entry) {
      if (key === 'id' || key === 'date') continue
      if (latestValues[key] === undefined && entry[key] !== null) {
        latestValues[key] = entry[key]
      }
    }
  }
  return latestValues
}

/**
 * Calculates weight change between the two most recent entries.
 */
export function calculateWeightChange(history: any[]) {
  let latestWeight: number | null = null
  let previousWeight: number | null = null

  for (const entry of history) {
    if (entry.weight !== null) {
      const weight = Number(entry.weight)
      if (latestWeight === null) {
        latestWeight = weight
      } else if (previousWeight === null) {
        previousWeight = weight
        break
      }
    }
  }

  if (latestWeight !== null && previousWeight !== null) {
    return {
      diff: Math.abs(latestWeight - previousWeight),
      isPositive: latestWeight > previousWeight,
    }
  }
  return null
}

/**
 * Calculates current workout streak.
 */
export function calculateStreak(workoutDates: Set<string>) {
  const today = new Date()
  const toDateKey = (date: Date) => date.toISOString().split('T')[0]

  let currentStreak = 0
  const streakCursor = new Date(today)
  if (!workoutDates.has(toDateKey(today))) {
    streakCursor.setDate(streakCursor.getDate() - 1)
  }
  while (workoutDates.has(toDateKey(streakCursor))) {
    currentStreak++
    streakCursor.setDate(streakCursor.getDate() - 1)
  }
  return currentStreak
}

/**
 * Calculates weekly workout metrics.
 */
export function calculateWeeklyMetrics(workoutLogs: any[], currentWeekStart: Date, lastWeekStart: Date) {
  const metrics = {
    workoutsThisWeek: 0,
    weeklyVolume: 0,
    lastWeekVolume: 0,
    weeklyDuration: 0,
    lastWeekDuration: 0,
    weeklyReps: 0,
    lastWeekReps: 0,
  }

  workoutLogs.forEach((w) => {
    if (!w.startTime) return
    const wDate = new Date(w.startTime)
    const isThisWeek = wDate >= currentWeekStart
    const isLastWeek = wDate >= lastWeekStart && wDate < currentWeekStart
    if (!isThisWeek && !isLastWeek) return

    if (isThisWeek) metrics.workoutsThisWeek++

    let workoutVolume = 0,
      workoutReps = 0,
      workoutDuration = 0
    if (w.endTime) {
      workoutDuration = Math.floor(
        (new Date(w.endTime).getTime() - new Date(w.startTime).getTime()) / 1000,
      )
    }

    w.exercises.forEach((ex: any) => {
      ex.sets.forEach((set: any) => {
        if (ex.exercise.exerciseType === 'weighted' || ex.exercise.exerciseType === 'assisted') {
          workoutVolume += (Number(set.weight) || 0) * (set.reps || 0)
        }
        workoutReps += set.reps || 0
      })
    })

    if (isThisWeek) {
      metrics.weeklyVolume += workoutVolume
      metrics.weeklyDuration += workoutDuration
      metrics.weeklyReps += workoutReps
    } else {
      metrics.lastWeekVolume += workoutVolume
      metrics.lastWeekDuration += workoutDuration
      metrics.lastWeekReps += workoutReps
    }
  })

  return metrics
}
