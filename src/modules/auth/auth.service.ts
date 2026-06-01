import type { FastifyRedis } from '@fastify/redis'
import type { PrismaClient } from '@prisma/client'
import type { TokenPayload } from 'google-auth-library'
import type { AppConfig } from '@/config/env'
import { UserRole } from '@prisma/client'
import { OAuth2Client } from 'google-auth-library'
import { nanoid } from 'nanoid'

const SESSION_PREFIX = 'session:'
const SESSION_TTL = 30 * 24 * 60 * 60 // 30 days in seconds
const ROTATION_THRESHOLD = 7 * 24 * 60 * 60 // 7 days in seconds

interface SessionData {
  userId: string
  role: UserRole
  createdAt: number
  lastUsed: number
}

export class AuthService {
  private googleClient: OAuth2Client

  constructor(
    private prisma: PrismaClient,
    private redis: FastifyRedis,
    private config: AppConfig,
  ) {
    this.googleClient = new OAuth2Client(config.GOOGLE_WEB_CLIENT_ID)
  }

  /**
   * Verifies a Google ID token and returns the payload.
   */
  async verifyGoogleToken(idToken: string) {
    const audiences = [this.config.GOOGLE_WEB_CLIENT_ID]
    const iosClientId = this.config.GOOGLE_IOS_CLIENT_ID
    if (iosClientId) {
      audiences.push(iosClientId)
    }
    const androidClientId = this.config.GOOGLE_ANDROID_CLIENT_ID
    if (androidClientId) {
      audiences.push(androidClientId)
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: audiences,
    })
    return ticket.getPayload()
  }

  /**
   * Finds or creates a user based on Google payload.
   */

  async findOrCreateUser(payload: TokenPayload) {
    const { sub: googleId, email, given_name, family_name, picture } = payload

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email: email ?? undefined }] },
    })

    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId },
        })
      }
    }
    else {
      if (!email) {
        throw new Error('Email is required for user creation')
      }
      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          firstName: given_name || '',
          lastName: family_name || '',
          profilePicUrl: picture || '',
          role: UserRole.member,
          privacyPolicyAcceptedAt: new Date(),
        },
      })
    }

    return user
  }

  /**
   * Creates a new session in Redis.
   */
  async createSession(userId: string, role: UserRole): Promise<string> {
    const sessionId = nanoid(32)
    const sessionData: SessionData = {
      userId,
      role,
      createdAt: Math.floor(Date.now() / 1000),
      lastUsed: Math.floor(Date.now() / 1000),
    }

    await this.redis.set(
      `${SESSION_PREFIX}${sessionId}`,
      JSON.stringify(sessionData),
      'EX',
      SESSION_TTL,
    )

    return sessionId
  }

  /**
   * Retrieves and refreshes a session from Redis.
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.get(`${SESSION_PREFIX}${sessionId}`)
    if (!data)
      return null

    const sessionData: SessionData = JSON.parse(data)
    sessionData.lastUsed = Math.floor(Date.now() / 1000)

    // Refresh TTL on every use (30-day inactivity revocation)
    await this.redis.set(
      `${SESSION_PREFIX}${sessionId}`,
      JSON.stringify(sessionData),
      'EX',
      SESSION_TTL,
    )

    return sessionData
  }

  /**
   * Rotates a session if it's older than the threshold.
   */
  async rotateSession(oldSessionId: string, sessionData: SessionData): Promise<string> {
    const now = Math.floor(Date.now() / 1000)

    // Only rotate if session is older than 7 days
    if (now - sessionData.createdAt < ROTATION_THRESHOLD) {
      return oldSessionId
    }

    // Create new session
    const newSessionId = await this.createSession(sessionData.userId, sessionData.role)

    // Delete old session
    await this.redis.del(`${SESSION_PREFIX}${oldSessionId}`)

    return newSessionId
  }

  /**
   * Revokes a session.
   */
  async revokeSession(sessionId: string) {
    await this.redis.del(`${SESSION_PREFIX}${sessionId}`)
  }
}
