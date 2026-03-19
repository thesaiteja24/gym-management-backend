import { NextFunction, Request, Response } from 'express'
import { ApiError } from '../../common/utils/ApiError.js'
import logger, { logDebug, logWarn } from '../../common/utils/logger.js'
import { RevenueCatService } from './revenuecat.service.js'

export const revenueCatWebhookHandler = async (req: Request, res: Response, next: NextFunction) => {
	try {
		// 1. Verify Authorization Header
		const authHeader = req.headers.authorization
		const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET

		if (!expectedSecret) {
			logger.error('REVENUECAT_WEBHOOK_SECRET is not configured in environment variables')
			return next(new ApiError(500, 'Internal server configuration error'))
		}

		if (authHeader !== `Bearer ${expectedSecret}` && authHeader !== expectedSecret) {
			logger.warn('Unauthorized RevenueCat webhook attempt')
			return res.status(401).json({ message: 'Unauthorized' })
		}

		const eventBody = req.body

		if (!eventBody || !eventBody.event) {
			return res.status(400).json({ message: 'Invalid payload' })
		}

		const event = eventBody.event

		logger.info(`Received RevenueCat Webhook: ${event.type} for user: ${event.app_user_id}`)

		await RevenueCatService.processEvent(event)

		// RevenueCat expects a 200 OK
		return res.status(200).json({ received: true })
	} catch (error) {
		logger.error('Error processing RevenueCat webhook', error)
		return next(new ApiError(500, 'Failed to process webhook'))
	}
}
