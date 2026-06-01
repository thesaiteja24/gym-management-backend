import type { FastifyInstance } from 'fastify'
import { CACHE_KEYS, CACHE_TTL } from '@/config/cache'
import { getOrSetCache } from '@/services/cache.service'

interface StreakResult {
  streak_days: number
}

/**
 * Computes consecutive days workout streak.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @returns The consecutive streak days.
 */
async function getStreakDays(app: FastifyInstance, userId: string): Promise<number> {
  const streakResult = await app.prisma.$queryRaw<StreakResult[]>`
    WITH RECURSIVE streak_cte AS (
      SELECT
        workout_date,
        1 AS streak
      FROM (
        SELECT DISTINCT DATE("startTime" AT TIME ZONE 'UTC') AS workout_date
        FROM "WorkoutLog"
        WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "startTime" IS NOT NULL
      ) d
      WHERE workout_date = CURRENT_DATE OR workout_date = CURRENT_DATE - 1

      UNION ALL

      SELECT
        d.workout_date,
        s.streak + 1
      FROM (
        SELECT DISTINCT DATE("startTime" AT TIME ZONE 'UTC') AS workout_date
        FROM "WorkoutLog"
        WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "startTime" IS NOT NULL
      ) d
      JOIN streak_cte s ON d.workout_date = s.workout_date - 1
    )
    SELECT COALESCE(MAX(streak), 0) AS streak_days FROM streak_cte;
  `
  return Number(streakResult[0]?.streak_days || 0)
}

interface MetricsResult {
  workouts_this_week: number
  weekly_volume: number
  last_week_volume: number
  weekly_duration: number
  last_week_duration: number
  weekly_reps: number
  last_week_reps: number
}

/**
 * Queries raw SQL workout metrics for the current and last weeks.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param lastWeekStart Start of the prior week.
 * @param currentWeekStart Start of the current week.
 * @returns Total workouts, volume, duration, and reps.
 */
async function getWeeklyMetrics(
  app: FastifyInstance,
  userId: string,
  lastWeekStart: Date,
  currentWeekStart: Date,
): Promise<MetricsResult> {
  const metricsResult = await app.prisma.$queryRaw<MetricsResult[]>`
    WITH workout_stats AS (
      SELECT
        w.id AS workout_id,
        w."startTime" AS start_time,
        COALESCE(EXTRACT(EPOCH FROM (w."endTime" - w."startTime")), 0)::integer AS duration,
        COALESCE(SUM(
          CASE
            WHEN ex.id IS NOT NULL AND e."exerciseType" IN ('weighted', 'assisted')
            THEN COALESCE(sets.weight, 0) * COALESCE(sets.reps, 0)
            ELSE 0
          END
        ), 0) AS volume,
        COALESCE(SUM(sets.reps), 0) AS reps
      FROM "WorkoutLog" w
      LEFT JOIN "WorkoutLogExercise" ex ON ex."workoutId" = w.id
      LEFT JOIN "Exercise" e ON e.id = ex."exerciseId"
      LEFT JOIN "WorkoutLogExerciseSet" sets ON sets."workoutExerciseId" = ex.id
      WHERE w."userId" = ${userId}
        AND w."deletedAt" IS NULL
        AND w."startTime" IS NOT NULL
        AND w."startTime" >= ${lastWeekStart}
      GROUP BY w.id, w."startTime", w."endTime"
    )
    SELECT
      COUNT(CASE WHEN start_time >= ${currentWeekStart} THEN 1 END)::integer AS workouts_this_week,
      SUM(CASE WHEN start_time >= ${currentWeekStart} THEN volume ELSE 0 END)::double precision AS weekly_volume,
      SUM(CASE WHEN start_time < ${currentWeekStart} THEN volume ELSE 0 END)::double precision AS last_week_volume,
      SUM(CASE WHEN start_time >= ${currentWeekStart} THEN duration ELSE 0 END)::integer AS weekly_duration,
      SUM(CASE WHEN start_time < ${currentWeekStart} THEN duration ELSE 0 END)::integer AS last_week_duration,
      SUM(CASE WHEN start_time >= ${currentWeekStart} THEN reps ELSE 0 END)::integer AS weekly_reps,
      SUM(CASE WHEN start_time < ${currentWeekStart} THEN reps ELSE 0 END)::integer AS last_week_reps
    FROM workout_stats;
  `
  return metricsResult[0] || {
    workouts_this_week: 0,
    weekly_volume: 0,
    last_week_volume: 0,
    weekly_duration: 0,
    last_week_duration: 0,
    weekly_reps: 0,
    last_week_reps: 0,
  }
}

interface LastWorkoutResult {
  startTime: Date
}

/**
 * Determines days elapsed since the user's last recorded workout log.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @param today Reference Date of today.
 * @returns Number of days since the last workout.
 */
async function getDaysSinceLastWorkout(
  app: FastifyInstance,
  userId: string,
  today: Date,
): Promise<number> {
  const lastWorkoutResult = await app.prisma.$queryRaw<LastWorkoutResult[]>`
    SELECT "startTime"
    FROM "WorkoutLog"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "startTime" IS NOT NULL
    ORDER BY "startTime" DESC
    LIMIT 1;
  `
  const lwd = lastWorkoutResult[0]?.startTime
  return lwd ? Math.floor((today.getTime() - new Date(lwd).getTime()) / 86400000) : 0
}

interface DateResult {
  wdate: string
}

/**
 * Retrieves the dates of logged workouts.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @returns Formatted workout date strings.
 */
async function getWorkoutDates(app: FastifyInstance, userId: string): Promise<string[]> {
  const datesResult = await app.prisma.$queryRaw<DateResult[]>`
    SELECT DISTINCT TO_CHAR("startTime", 'YYYY-MM-DD') AS wdate
    FROM "WorkoutLog"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "startTime" IS NOT NULL
    ORDER BY wdate DESC;
  `
  return datesResult.map(r => r.wdate)
}

/**
 * Calculates user statistics, consecutive streaks, and weekly aggregates.
 * @param app Fastify instance.
 * @param userId The ID of the user.
 * @returns Computed statistics.
 */
export async function queryUserAnalytics(app: FastifyInstance, userId: string) {
  const cacheKey = CACHE_KEYS.analytics(userId)

  return getOrSetCache(app.redis, cacheKey, CACHE_TTL.day, async () => {
    const today = new Date()
    const currentWeekStart = new Date(today)
    const day = today.getDay()
    currentWeekStart.setDate(today.getDate() - day + (day === 0 ? -6 : 1))
    currentWeekStart.setHours(0, 0, 0, 0)
    const lastWeekStart = new Date(currentWeekStart.getTime() - 7 * 86400000)

    const [streakDays, metrics, daysSinceLastWorkout, workoutDates] = await Promise.all([
      getStreakDays(app, userId),
      getWeeklyMetrics(app, userId, lastWeekStart, currentWeekStart),
      getDaysSinceLastWorkout(app, userId, today),
      getWorkoutDates(app, userId),
    ])

    return {
      workoutsThisWeek: Number(metrics.workouts_this_week || 0),
      weeklyVolume: Number(metrics.weekly_volume || 0),
      lastWeekVolume: Number(metrics.last_week_volume || 0),
      weeklyDuration: Number(metrics.weekly_duration || 0),
      lastWeekDuration: Number(metrics.last_week_duration || 0),
      weeklyReps: Number(metrics.weekly_reps || 0),
      lastWeekReps: Number(metrics.last_week_reps || 0),
      streakDays,
      daysSinceLastWorkout,
      workoutDates,
    }
  })
}
