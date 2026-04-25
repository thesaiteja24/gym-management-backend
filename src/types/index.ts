import type { Request, Response, NextFunction } from 'express'
import { TokenPayload } from '../modules/auth/types.js'

// User role enum (mirrors Prisma enum)
export type UserRole = 'systemAdmin' | 'gymAdmin' | 'trainer' | 'member'

// Express Request with authenticated user
export interface AuthenticatedRequest extends Request {
  user: TokenPayload
}

// Async controller handler type
export type AsyncRequestHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = qs.ParsedQs,
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction,
) => Promise<void | Response>

// API Response structure
export interface ApiResponseData<T = unknown> {
  statusCode: number
  data: T
  message: string
  success: boolean
}

// Logger request type (for optional request context)
export interface LoggerRequest {
  user?: { id: string } | null
  ip?: string
  ips?: string[]
}
