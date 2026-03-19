import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import logger, { logWarn } from '../../common/utils/logger.js'

const prisma = new PrismaClient().$extends(withAccelerate())

export class RevenueCatService {
	static async processEvent(event: any) {
		const { id, type, app_user_id, event_timestamp_ms, expiration_at_ms, entitlement_ids, product_id } = event

		if (!id || !app_user_id || !type) {
			logger.warn('Missing essential fields in RevenueCat event', { eventId: id, user: app_user_id, type })
			return
		}

		// Use a transaction to ensure idempotency and atomic updates
		await prisma.$transaction(async (tx: any) => {
			// 1. Check idempotency
			const existingEvent = await tx.revenueCatEvent.findUnique({
				where: { id },
			})

			if (existingEvent) {
				logger.info(`RevenueCat event ${id} already processed. Skipping.`)
				return // Idempotent success
			}

			// 2. Fetch the user
			const user = await tx.user.findUnique({
				where: { id: app_user_id },
			})

			if (!user) {
				// User might be deleted, or it's a sandbox test user not in our DB.
				logger.warn(`User ${app_user_id} not found for RevenueCat event ${id}`)
				// We still record the event so we don't retry processing
				await tx.revenueCatEvent.create({
					data: {
						id,
						type,
						appUserId: app_user_id,
						eventTimestamp: new Date(Number(event_timestamp_ms)),
					},
				})
				return
			}

			// 3. Process based on event type
			let isPro = user.isPro
			let proExpirationDate = user.proExpirationDate
			let proSubscriptionType = user.proSubscriptionType

			const now = new Date()
			const expirationDate = expiration_at_ms ? new Date(Number(expiration_at_ms)) : null

			const period_type = product_id.toLowerCase().includes('year')
				? 'yearly'
				: product_id.toLowerCase().includes('month')
					? 'monthly'
					: 'lifetime'

			switch (type) {
				case 'INITIAL_PURCHASE':
				case 'RENEWAL':
				case 'NON_RENEWING_PURCHASE':
				case 'UNCANCELLATION':
					// A null expirationDate from RevenueCat means a lifetime purchase.
					if (expirationDate && expirationDate > now) {
						isPro = true
						proExpirationDate = expirationDate
						proSubscriptionType = period_type
					} else if (!expirationDate) {
						// Lifetime purchase or no expiration
						isPro = true
						proExpirationDate = null
						proSubscriptionType = period_type
					}
					break

				case 'CANCELLATION':
				case 'EXPIRATION':
				case 'BILLING_ISSUE':
					// If the expiration date has passed, they are no longer pro.
					// CANCELLATION indicates auto-renew is off, but they may still have time left.
					if (expirationDate && expirationDate <= now) {
						isPro = false
					} else if (!expirationDate) {
						// If somehow there's no expiration date but it's an expiration event?
						// Safer to demote.
						isPro = false
					}
					// Only update expiration date if the webhook provided a new one
					if (expirationDate) {
						proExpirationDate = expirationDate
					}
					break

				case 'TRANSFER':
					// Complex case. For simple implementations, rely on RESTORE from app.
					break

				default:
					logger.info(`Unhandled RevenueCat event type: ${type}`)
					break
			}

			// 4. Update the user
			await tx.user.update({
				where: { id: app_user_id },
				data: {
					isPro,
					proExpirationDate,
					proSubscriptionType,
					proSubscriptionId: event.original_transaction_id || user.proSubscriptionId,
				},
			})

			// 5. Record the event
			await tx.revenueCatEvent.create({
				data: {
					id,
					type,
					appUserId: app_user_id,
					eventTimestamp: new Date(Number(event_timestamp_ms)),
				},
			})

			logger.info(`Successfully processed ${type} event for user ${app_user_id}. isPro: ${isPro}`)
		})
	}
}
