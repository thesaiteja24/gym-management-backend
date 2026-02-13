import { Request, Response, NextFunction } from 'express'

// User role enum (mirrors Prisma enum)
export type UserRole = 'systemAdmin' | 'gymAdmin' | 'trainer' | 'member'

// JWT Token Payload
export interface TokenPayload {
	id: string
	role: UserRole
	email: string | null
	phoneE164: string | null
}

// Authenticated User (attached to req.user by auth middleware)
export interface AuthUser {
	id: string
	phoneE164: string
	role: UserRole
}

// Express Request with authenticated user
export interface AuthenticatedRequest extends Request {
	user: AuthUser
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
	next: NextFunction
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
