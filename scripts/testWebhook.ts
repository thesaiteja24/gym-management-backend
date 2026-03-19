import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { RevenueCatService } from '../src/modules/webhooks/revenuecat.service.js'

const prisma = new PrismaClient().$extends(withAccelerate())

async function run() {
	console.log('--- Setting up test ---')
	// 1. Create a dummy user
	const user = await prisma.user.create({
		data: {
			phone: '1234567890',
			phoneE164: '+1234567890',
		},
	})

	console.log('Created test user:', user.id)

	// 2. Mock a purchase event
	const mockEvent = {
		type: 'INITIAL_PURCHASE',
		id: 'test-event-' + Date.now(),
		app_user_id: user.id,
		event_timestamp_ms: Date.now(),
		expiration_at_ms: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days later
		original_transaction_id: 'tx_12345',
	}

	console.log('--- Processing webhook event ---')
	await RevenueCatService.processEvent(mockEvent)

	// 3. Verify user isPro
	const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
	console.log('User after INITIAL_PURCHASE:', {
		isPro: updatedUser?.isPro,
		expiration: updatedUser?.proExpirationDate,
	})

	// 4. Mock an expiration event
	const cancelEvent = {
		type: 'EXPIRATION',
		id: 'test-event-' + Date.now(),
		app_user_id: user.id,
		event_timestamp_ms: Date.now(),
		expiration_at_ms: Date.now() - 10000, // 10 seconds ago
		original_transaction_id: 'tx_12345',
	}

	console.log('--- Processing cancellation webhook event ---')
	await RevenueCatService.processEvent(cancelEvent)

	const finalUser = await prisma.user.findUnique({ where: { id: user.id } })
	console.log('User after EXPIRATION:', {
		isPro: finalUser?.isPro,
		expiration: finalUser?.proExpirationDate,
		type: finalUser?.proSubscriptionType,
	})

	// 5. Mock the exact promotional payload provided by the user
	const promotionalEvent = {
		type: 'NON_RENEWING_PURCHASE',
		id: '426D9C95-8BD1-43E5-AA74-A8A08495A8D1-' + Date.now(),
		app_user_id: user.id,
		event_timestamp_ms: 1773074985444,
		expiration_at_ms: null,
		product_id: 'rc_promo_PUMP Pro_lifetime',
		period_type: 'PROMOTIONAL',
	}

	console.log('--- Processing promotional webhook event ---')
	await RevenueCatService.processEvent(promotionalEvent)

	const promoUser = await prisma.user.findUnique({ where: { id: user.id } })
	console.log('User after PROMOTIONAL GRANT:', {
		isPro: promoUser?.isPro,
		expiration: promoUser?.proExpirationDate,
		type: promoUser?.proSubscriptionType,
	})

	console.log('--- Cleanup test ---')
	await prisma.revenueCatEvent.deleteMany({ where: { appUserId: user.id } })
	await prisma.user.delete({ where: { id: user.id } })

	console.log('Done.')
	process.exit(0)
}

run().catch(e => {
	console.error(e)
	process.exit(1)
})
