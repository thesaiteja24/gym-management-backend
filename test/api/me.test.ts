/* eslint-disable max-lines-per-function, max-lines */
import type { FastifyTypedInstance } from '@/types/index'
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { getTestApp } from '../helper'

// Mock Google Auth
mock.module('google-auth-library', () => {
  return {
    OAuth2Client: class {
      verifyIdToken = mock(() => Promise.resolve({
        getPayload: () => ({
          sub: 'google-me-user',
          email: 'me-test@example.com',
          email_verified: true,
          given_name: 'Me',
          family_name: 'Tester',
          picture: 'https://example.com/me.jpg',
        }),
      }))
    },
  }
})

describe('Me Module: Profile, Fitness, Nutrition, and Measurements', () => {
  let app: FastifyTypedInstance
  let sessionId: string
  let userId: string

  beforeAll(async () => {
    app = (await getTestApp()) as FastifyTypedInstance

    // Register/Login to get sessionId
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      payload: { idToken: 'fake-google-token' },
    })

    const body = JSON.parse(loginRes.body)
    sessionId = body.data.sessionId
    userId = body.data.user.id
  })

  afterAll(async () => {
    if (app) {
      // Clean up test data
      await app.prisma.userMeasurement.deleteMany({ where: { userId } })
      await app.prisma.userFitnessProfile.deleteMany({ where: { userId } })
      await app.prisma.userNutritionPlan.deleteMany({ where: { userId } })
      await app.prisma.workoutLogExerciseSet.deleteMany({
        where: { workoutExercise: { workout: { userId } } },
      })
      await app.prisma.workoutLogExercise.deleteMany({
        where: { workout: { userId } },
      })
      await app.prisma.workoutLog.deleteMany({ where: { userId } })
      await app.prisma.exercise.deleteMany({ where: { title: 'Squat' } })
      await app.prisma.user.delete({ where: { id: userId } })
      await app.close()
    }
  })

  it('1. should fetch own profile successfully', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(res.statusCode).toBe(200)
    const { data: profile } = JSON.parse(res.body)
    expect(profile.id).toBe(userId)
    expect(profile.email).toBe('me-test@example.com')
    expect(profile.workoutsCount).toBe(0)
  })

  it('2. should update own profile successfully', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        firstName: 'Pumped',
        lastName: 'Developer',
        gender: 'male',
        dateOfBirth: '1995-10-15',
        height: 180.5,
        weight: 82.3,
      },
    })

    expect(res.statusCode).toBe(200)
    const { data: profile } = JSON.parse(res.body)
    expect(profile.firstName).toBe('Pumped')
    expect(profile.lastName).toBe('Developer')
    expect(profile.dateOfBirth).toBe('1995-10-15T00:00:00.000Z')
    expect(profile.height).toBe(180.5)
    expect(profile.weight).toBe(82.3)
  })

  it('2b. should reject profile updates with additional/unexpected properties or invalid types', async () => {
    const res1 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        firstName: 123,
      },
    })
    expect(res1.statusCode).toBe(400)

    const res2 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        firstName: 'Pumped',
        isPro: true,
        role: 'systemAdmin',
      },
    })
    expect(res2.statusCode).toBe(400)
    const body = JSON.parse(res2.body)
    expect(body.success).toBe(false)
  })

  it('2d. should reject empty profile updates with 400 Bad Request due to minProperties: 1', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.details[0].message).toBe('At least one field must be provided')
  })

  it('2c. should reject profile updates with invalid business rules (e.g., negative weight)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        weight: -20,
      },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.details[0].path).toBe('weight')
    expect(body.error.details[0].message).toBe('Weight must be greater than 0')
  })

  it('2e. should update own preferences successfully', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me/preferences',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        timezone: 'Asia/Kolkata',
        weekStartsOn: 1,
      },
    })

    expect(res.statusCode).toBe(200)
    const { data: preferences } = JSON.parse(res.body)
    expect(preferences.timezone).toBe('Asia/Kolkata')
    expect(preferences.weekStartsOn).toBe(1)

    const profileRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const { data: profile } = JSON.parse(profileRes.body)
    expect(profile.timezone).toBe('Asia/Kolkata')
    expect(profile.weekStartsOn).toBe(1)
  })

  it('2f. should reject invalid preference updates', async () => {
    const invalidTimezoneRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me/preferences',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        timezone: 'UTC+05:30',
      },
    })
    expect(invalidTimezoneRes.statusCode).toBe(400)

    const invalidWeekStartRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me/preferences',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        weekStartsOn: 7,
      },
    })
    expect(invalidWeekStartRes.statusCode).toBe(400)
  })

  it('3. should return null if fitness profile is not set', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/fitness',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).data).toBeNull()
  })

  it('4. should upsert fitness profile and nutrition targets successfully', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me/fitness',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        fitnessGoal: 'gainMuscle',
        fitnessLevel: 'intermediate',
        availableEquipment: ['dumbbells', 'barbells'],
        targetWeight: 85,
        weeklyWeightChange: 0.25,
        nutritionPlan: {
          caloriesTarget: 3200,
          proteinTarget: 180,
          carbsTarget: 400,
          fatsTarget: 80,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    const { data: fitness } = JSON.parse(res.body)
    expect(fitness.fitnessGoal).toBe('gainMuscle')
    expect(fitness.fitnessLevel).toBe('intermediate')
    expect(fitness.availableEquipment).toContain('dumbbells')
    expect(fitness.targetWeight).toBe(85)
    expect(fitness.nutritionPlan.caloriesTarget).toBe(3200)
    expect(fitness.nutritionPlan.proteinTarget).toBe(180)
  })

  it('5. should fetch fitness profile successfully after upserting', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/fitness',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(res.statusCode).toBe(200)
    const { data: fitness } = JSON.parse(res.body)
    expect(fitness.fitnessGoal).toBe('gainMuscle')
    expect(fitness.nutritionPlan.caloriesTarget).toBe(3200)
  })

  it('6. should fetch nutrition plan independently successfully', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/nutrition',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(res.statusCode).toBe(200)
    const { data: nutrition } = JSON.parse(res.body)
    expect(nutrition.caloriesTarget).toBe(3200)
    expect(nutrition.proteinTarget).toBe(180)
  })

  it('7. should update nutrition plan independently successfully', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me/nutrition',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        caloriesTarget: 3300,
        proteinTarget: 190,
      },
    })

    expect(res.statusCode).toBe(200)
    const { data: nutrition } = JSON.parse(res.body)
    expect(nutrition.caloriesTarget).toBe(3300)
    expect(nutrition.proteinTarget).toBe(190)
  })

  it('7b. should preserve an existing nutrition plan when fitness is patched independently', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me/fitness',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        fitnessLevel: 'advanced',
      },
    })

    expect(res.statusCode).toBe(200)
    const { data: fitness } = JSON.parse(res.body)
    expect(fitness.fitnessLevel).toBe('advanced')
    expect(fitness.nutritionPlan.caloriesTarget).toBe(3300)
    expect(fitness.nutritionPlan.proteinTarget).toBe(190)
  })

  it('8. should successfully create daily body measurement entries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-17T00:00:00.000Z',
        weight: 82.5,
        bodyFat: 15.2,
        waist: 84.0,
      },
    })

    expect(res.statusCode).toBe(200)
    const { data: measurement } = JSON.parse(res.body)
    expect(measurement.date).toBe('2026-05-17T00:00:00.000Z')
    expect(measurement.weight).toBe(82.5)
    expect(measurement.bodyFat).toBe(15.2)
  })

  it('8b. should reject duplicate daily body measurement entries with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-17T00:00:00.000Z',
        weight: 83.0,
      },
    })

    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('CONFLICT')
  })

  it('8bb. should successfully create multiple measurements on the same day with different times', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-17T12:00:00.000Z',
        weight: 83.5,
      },
    })
    expect(res.statusCode).toBe(200)
    const { data: measurement } = JSON.parse(res.body)
    expect(measurement.date).toBe('2026-05-17T12:00:00.000Z')
    expect(measurement.weight).toBe(83.5)
  })

  it('8c. should reject future date for daily body measurement entries', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 2)
    const futureStr = futureDate.toISOString()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: futureStr,
        weight: 80.0,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('8d. should reject invalid date format for daily body measurement entries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: 'not-a-date',
        weight: 80.0,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('9. should fetch measurements history and calculate weight change', async () => {
    // Inject a previous measurement entry to calculate differences
    await app.prisma.userMeasurement.create({
      data: {
        userId,
        date: new Date('2026-05-16T00:00:00.000Z'),
        weight: 82.1,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(res.statusCode).toBe(200)
    const { data: body } = JSON.parse(res.body)
    expect(body.history.length).toBe(3)
    expect(body.history[0].weight).toBe(83.5)
    expect(body.history[1].weight).toBe(82.5)
    expect(body.history[2].weight).toBe(82.1)
    expect(body.latestValues.bodyFat).toBe(15.2)
    expect(body.dailyWeightChange).toBeDefined()
    expect(Number(body.dailyWeightChange.diff.toFixed(2))).toBe(1.0)
    expect(body.dailyWeightChange.isPositive).toBe(true)
  })

  it('10. should calculate workout streaks and analytics correctly', async () => {
    const todayStr = new Date().toISOString().split('T')[0] || ''

    // 1. Create exercise record beforehand to reference it by ID
    const exercise = await app.prisma.exercise.create({
      data: {
        title: 'Squat',
        exerciseType: 'weighted',
      },
    })

    // 2. Create the workout log linking to the exercise
    await app.prisma.workoutLog.create({
      data: {
        userId,
        startTime: new Date(`${todayStr}T10:00:00.000Z`),
        endTime: new Date(`${todayStr}T11:00:00.000Z`),
        exercises: {
          create: [
            {
              exerciseIndex: 0,
              exerciseId: exercise.id,
              sets: {
                create: [
                  { setIndex: 0, weight: 100, reps: 10 },
                  { setIndex: 1, weight: 100, reps: 10 },
                ],
              },
            },
          ],
        },
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/analytics',
      headers: { authorization: `Bearer ${sessionId}` },
    })

    expect(res.statusCode).toBe(200)
    const { data: stats } = JSON.parse(res.body)
    expect(stats.workoutsThisWeek).toBe(1)
    expect(stats.weeklyVolume).toBe(2000) // 100kg * 10 reps * 2 sets
    expect(stats.weeklyReps).toBe(20)
    expect(stats.weeklyDuration).toBe(3600) // 1 hour
    expect(stats.streakDays).toBe(1)
  })

  it('11. should successfully update an owned measurement entry', async () => {
    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const { data: body } = JSON.parse(historyRes.body)
    const targetMeasurement = (body.history as Array<{ id: string, date: string }>).find(
      m => m.date === '2026-05-17T00:00:00.000Z',
    )
    const measurementId = targetMeasurement!.id

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/me/measurements/${measurementId}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-17T00:00:00.000Z',
        weight: 84.5,
        notes: 'Updated note here',
      },
    })

    expect(updateRes.statusCode).toBe(200)
    const { data: updatedMeasurement } = JSON.parse(updateRes.body)
    expect(updatedMeasurement.weight).toBe(84.5)
    expect(updatedMeasurement.notes).toBe('Updated note here')
  })

  it('12. should reject updating another user\'s measurement or non-existent measurement', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000000'
    const nonExistentRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/me/measurements/${randomUuid}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { date: '2026-05-17T00:00:00.000Z', weight: 80 },
    })
    expect(nonExistentRes.statusCode).toBe(404)

    const otherUser = await app.prisma.user.create({
      data: {
        email: 'other-user@example.com',
        googleId: 'google-other-123',
        firstName: 'Other',
        lastName: 'User',
        profilePicUrl: '',
        role: 'member',
        privacyPolicyAcceptedAt: new Date(),
      },
    })
    const otherMeasurement = await app.prisma.userMeasurement.create({
      data: {
        userId: otherUser.id,
        date: new Date('2026-05-18T00:00:00.000Z'),
        weight: 75.0,
      },
    })

    const unauthorizedRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/me/measurements/${otherMeasurement.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: { date: '2026-05-18T00:00:00.000Z', weight: 77 },
    })
    expect(unauthorizedRes.statusCode).toBe(401)

    // Clean up
    await app.prisma.userMeasurement.deleteMany({ where: { userId: otherUser.id } })
    await app.prisma.user.delete({ where: { id: otherUser.id } })
  })

  it('12b. should reject updating measurement with empty body or invalid metric constraints', async () => {
    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const { data: body } = JSON.parse(historyRes.body)
    const measurementId = body.history[0].id

    // Empty body
    const emptyRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/me/measurements/${measurementId}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {},
    })
    expect(emptyRes.statusCode).toBe(400)

    // Negative weight
    const invalidRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/me/measurements/${measurementId}`,
      headers: { authorization: `Bearer ${sessionId}` },
      payload: {
        date: '2026-05-17T00:00:00.000Z',
        weight: -10,
      },
    })
    expect(invalidRes.statusCode).toBe(400)
  })

  it('13. should reject deleting another user\'s measurement or non-existent measurement', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000000'
    const nonExistentRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/me/measurements/${randomUuid}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(nonExistentRes.statusCode).toBe(404)

    const otherUser = await app.prisma.user.create({
      data: {
        email: 'other-user-delete@example.com',
        googleId: 'google-other-delete-123',
        firstName: 'Other',
        lastName: 'User',
        profilePicUrl: '',
        role: 'member',
        privacyPolicyAcceptedAt: new Date(),
      },
    })
    const otherMeasurement = await app.prisma.userMeasurement.create({
      data: {
        userId: otherUser.id,
        date: new Date('2026-05-18T00:00:00.000Z'),
        weight: 75.0,
      },
    })

    const unauthorizedRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/me/measurements/${otherMeasurement.id}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(unauthorizedRes.statusCode).toBe(401)

    // Clean up
    await app.prisma.userMeasurement.deleteMany({ where: { userId: otherUser.id } })
    await app.prisma.user.delete({ where: { id: otherUser.id } })
  })

  it('14. should successfully delete an owned measurement entry', async () => {
    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const { data: body } = JSON.parse(historyRes.body)
    const measurementId = body.history[0].id

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/me/measurements/${measurementId}`,
      headers: { authorization: `Bearer ${sessionId}` },
    })
    expect(deleteRes.statusCode).toBe(200)

    const confirmRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/measurements',
      headers: { authorization: `Bearer ${sessionId}` },
    })
    const { data: updatedBody } = JSON.parse(confirmRes.body)
    expect(updatedBody.history.some((m: { id: string }) => m.id === measurementId)).toBe(false)
  })
})
