import type { FastifyRedis } from '@fastify/redis'
import type { PrismaClient } from '@prisma/client'
import type { TokenPayload } from 'google-auth-library'
import type { AppConfig } from '@/config/env'
import { createHash } from 'node:crypto'
import { Prisma, UserRole } from '@prisma/client'
import { OAuth2Client } from 'google-auth-library'
import { nanoid } from 'nanoid'
import { HttpError } from '@/utils/response'

const SESSION_PREFIX = 'session:'
const USER_SESSION_PREFIX = 'user-sessions:'
const SESSION_TTL = 30 * 24 * 60 * 60 // 30 days in seconds
const ROTATION_THRESHOLD = 7 * 24 * 60 * 60 // 7 days in seconds

interface SessionData {
  userId: string
  role: UserRole
  createdAt: number
  lastUsed: number
}

export function getSessionRedisKey(sessionId: string, secret = '') {
  const tokenHash = createHash('sha256')
    .update(secret)
    .update(':')
    .update(sessionId)
    .digest('hex')

  return `${SESSION_PREFIX}${tokenHash}`
}

export class AuthService {
  private googleClient: OAuth2Client
  private sessionSecret: string

  constructor(
    private prisma: PrismaClient,
    private redis: FastifyRedis,
    private config: AppConfig,
  ) {
    this.googleClient = new OAuth2Client(config.GOOGLE_WEB_CLIENT_ID)
    this.sessionSecret = config.SESSION_SECRET
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

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      })
      return ticket.getPayload()
    }
    catch {
      throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Invalid Google Token')
    }
  }

  /**
   * Finds or creates a user based on Google payload.
   */

  async findOrCreateUser(payload: TokenPayload) {
    const { sub: googleId, email, email_verified, given_name, family_name, picture } = payload

    if (!googleId) {
      throw new HttpError(400, 'INVALID_GOOGLE_TOKEN', 'Google subject is required')
    }

    if (!email || email_verified !== true) {
      throw new HttpError(400, 'UNVERIFIED_GOOGLE_EMAIL', 'A verified Google email is required')
    }

    const existingUser = await this.findUserByGoogleIdentity(googleId, email)
    if (existingUser) {
      return existingUser
    }

    return this.createOrReloadUserAfterSignupRace({
      email,
      googleId,
      firstName: given_name || '',
      lastName: family_name || '',
      profilePicUrl: picture || '',
    })
  }

  /**
   * Returns an existing app user for documentation access without creating an account.
   */
  async findExistingUserForDocs(payload: TokenPayload) {
    const { sub: googleId, email, email_verified } = payload

    if (!googleId) {
      throw new HttpError(400, 'INVALID_GOOGLE_TOKEN', 'Google subject is required')
    }

    if (!email || email_verified !== true) {
      throw new HttpError(400, 'UNVERIFIED_GOOGLE_EMAIL', 'A verified Google email is required')
    }

    const user = await this.prisma.user.findUnique({ where: { googleId } })
    if (!user) {
      throw new HttpError(403, 'DOCS_ACCESS_DENIED', 'Sign in through the Pump app before accessing the API docs')
    }

    return user
  }

  private async createOrReloadUserAfterSignupRace(data: {
    email: string
    googleId: string
    firstName: string
    lastName: string
    profilePicUrl: string
  }) {
    try {
      return await this.prisma.user.create({
        data: {
          ...data,
          role: UserRole.member,
          privacyPolicyAcceptedAt: new Date(),
        },
      })
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedUser = await this.findUserByGoogleIdentity(data.googleId, data.email)
        if (racedUser) {
          return racedUser
        }
      }

      throw error
    }
  }

  /**
   * Returns the current database role so session authorization reflects role changes immediately.
   */
  async getCurrentUserRole(userId: string): Promise<UserRole | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    return user?.role ?? null
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

    await this.redis.eval(
      `
        local members = redis.call("ZRANGE", KEYS[2], 0, -1)
        for _, member in ipairs(members) do
          if redis.call("EXISTS", member) == 0 then
            redis.call("ZREM", KEYS[2], member)
          end
        end

        redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
        redis.call("ZADD", KEYS[2], ARGV[3], KEYS[1])

        local overflow = redis.call("ZCARD", KEYS[2]) - tonumber(ARGV[4])
        if overflow > 0 then
          local oldest = redis.call("ZRANGE", KEYS[2], 0, overflow - 1)
          for _, member in ipairs(oldest) do
            redis.call("DEL", member)
            redis.call("ZREM", KEYS[2], member)
          end
        end

        redis.call("EXPIRE", KEYS[2], ARGV[2])
      `,
      2,
      this.getSessionKey(sessionId),
      this.getUserSessionsKey(userId),
      JSON.stringify(sessionData),
      SESSION_TTL,
      Date.now(),
      this.config.SESSION_MAX_PER_USER,
    )

    return sessionId
  }

  /**
   * Retrieves and refreshes a session from Redis.
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const sessionKey = this.getSessionKey(sessionId)
    const data = await this.redis.eval(
      `
        local data = redis.call("GET", KEYS[1])
        if not data then
          return nil
        end

        redis.call("EXPIRE", KEYS[1], ARGV[1])
        local ok, session = pcall(cjson.decode, data)
        if ok and session.userId then
          redis.call("EXPIRE", ARGV[2] .. session.userId, ARGV[1])
        end
        return data
      `,
      1,
      sessionKey,
      SESSION_TTL,
      USER_SESSION_PREFIX,
    ) as string | null
    if (!data)
      return null

    const sessionData = await this.parseSessionData(sessionKey, data)
    if (!sessionData)
      return null

    sessionData.lastUsed = Math.floor(Date.now() / 1000)

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

    const oldSessionKey = this.getSessionKey(oldSessionId)
    const newSessionId = nanoid(32)
    const newSessionKey = this.getSessionKey(newSessionId)
    const userSessionsKey = this.getUserSessionsKey(sessionData.userId)
    const newSessionData: SessionData = {
      userId: sessionData.userId,
      role: sessionData.role,
      createdAt: now,
      lastUsed: now,
    }

    const rotated = await this.redis.eval(
      `
        if redis.call("EXISTS", KEYS[1]) == 0 then
          return 0
        end

        redis.call("DEL", KEYS[1])
        redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[1])
        redis.call("ZREM", KEYS[3], KEYS[1])
        redis.call("ZADD", KEYS[3], ARGV[3], KEYS[2])
        redis.call("EXPIRE", KEYS[3], ARGV[1])
        return 1
      `,
      3,
      oldSessionKey,
      newSessionKey,
      userSessionsKey,
      SESSION_TTL,
      JSON.stringify(newSessionData),
      Date.now(),
    )

    return Number(rotated) === 1 ? newSessionId : oldSessionId
  }

  /**
   * Revokes a session.
   */
  async revokeSession(sessionId: string) {
    await this.redis.eval(
      `
        local data = redis.call("GET", KEYS[1])
        if data then
          local ok, session = pcall(cjson.decode, data)
          if ok and session.userId then
            redis.call("ZREM", ARGV[1] .. session.userId, KEYS[1])
          end
        end

        return redis.call("DEL", KEYS[1])
      `,
      1,
      this.getSessionKey(sessionId),
      USER_SESSION_PREFIX,
    )
  }

  private getSessionKey(sessionId: string) {
    return getSessionRedisKey(sessionId, this.sessionSecret)
  }

  private getUserSessionsKey(userId: string) {
    return `${USER_SESSION_PREFIX}${userId}`
  }

  private async findUserByGoogleIdentity(googleId: string, email: string) {
    const googleUser = await this.prisma.user.findUnique({ where: { googleId } })
    if (googleUser) {
      return googleUser
    }

    return this.prisma.user.findUnique({ where: { email } })
  }

  private async parseSessionData(key: string, data: string): Promise<SessionData | null> {
    try {
      const parsed = JSON.parse(data) as Partial<SessionData>

      if (
        !parsed.userId
        || !parsed.role
        || typeof parsed.createdAt !== 'number'
        || typeof parsed.lastUsed !== 'number'
        || !this.isValidRole(parsed.role)
      ) {
        await this.redis.del(key)
        return null
      }

      return {
        userId: parsed.userId,
        role: parsed.role,
        createdAt: parsed.createdAt,
        lastUsed: parsed.lastUsed,
      }
    }
    catch {
      await this.redis.del(key)
      return null
    }
  }

  private isValidRole(role: unknown): role is UserRole {
    if (typeof role !== 'string') {
      return false
    }

    return Object.values(UserRole).includes(role as UserRole)
  }
}
