import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { ApiError } from '../../utils/ApiError.js'

import type { PublicUser } from './user.types.js'
import { buildNudgeNotification } from './nudge.util.js'
import { NotificationService } from '../../service/notification.service.js'
import { formatPublicUser } from './user.formatters.js'
import { getPublicUserSelect, publicUserSelect } from './user.selectors.js'

const prisma = new PrismaClient().$extends(withAccelerate())




// SECTION: PUBLIC USER DATABASE OPERATIONS
/**
 * Fetch a public user profile by ID.
 * @param userId The ID of the user to fetch
 * @param currentUserId Optional ID of the user making the request (for follow status)
 * @returns Formatted public user data
 */
export async function getUserById(userId: string, currentUserId?: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: getPublicUserSelect(currentUserId),
  })

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  return formatPublicUser(user, currentUserId)
}

/**
 * Function to nudge a user.
 * @param userId The ID of the user to nudge
 * @param currentUserId The ID of the user making the request
 * @param note The optional note to send to the user
 */
export async function nudgeUser(userId: string, currentUserId: string, note?: string) {
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
  })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      workoutLogs: {
        where: { deletedAt: null },
        orderBy: { startTime: 'desc' },
        take: 1,
        select: { startTime: true },
      },
    },
  })

  if (!user) {
    throw new ApiError(404, 'Receiver not found')
  }

  if (!currentUser) {
    throw new ApiError(404, 'Sender not found')
  }

  // Calculate if the user has an active streak (workout today or yesterday)
  const toDateKey = (date: Date) => date.toISOString().split('T')[0]
  const now = new Date()
  const today = toDateKey(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(now.getDate() - 1)
  const yesterday = toDateKey(yesterdayDate)

  const lastWorkoutDate = (user as any).workoutLogs?.[0]?.startTime
    ? toDateKey(new Date((user as any).workoutLogs[0].startTime))
    : null

  const hasActiveStreak = !!lastWorkoutDate && (lastWorkoutDate === today || lastWorkoutDate === yesterday)

  const message = buildNudgeNotification({
    senderName: currentUser.firstName ?? 'Pump user',
    hasActiveStreak,
    personalNote: note,
  })

  await NotificationService.sendPushToUsers(
    [userId],
    message.title,
    message.content
  ).catch(() => {})

  return true
}

