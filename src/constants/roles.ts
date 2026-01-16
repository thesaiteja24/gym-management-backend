import { UserRole } from '../generated/prisma/client.js'

export const ROLES: Readonly<Record<UserRole, UserRole>> = Object.freeze({
	systemAdmin: 'systemAdmin',
	gymAdmin: 'gymAdmin',
	trainer: 'trainer',
	member: 'member',
})
