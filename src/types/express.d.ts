import { AuthUser } from './index.js'

declare global {
	namespace Express {
		interface Request {
			user?: AuthUser
		}
	}
}

export {}
