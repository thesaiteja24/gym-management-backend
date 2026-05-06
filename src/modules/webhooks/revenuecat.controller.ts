import type { NextFunction, Request, Response } from 'express'

import { ApiError } from '../../utils/ApiError.js'

import { RevenueCatService } from './revenuecat.service.js'

export const revenueCatWebhookHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Verify Authorization Header
    const authHeader = req.headers.authorization
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET

    if (!expectedSecret) {
      return next(new ApiError(500, 'Internal server configuration error'))
    }

    if (authHeader !== `Bearer ${expectedSecret}` && authHeader !== expectedSecret) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const eventBody = req.body

    if (!eventBody || !eventBody.event) {
      return res.status(400).json({ message: 'Invalid payload' })
    }

    const event = eventBody.event

    await RevenueCatService.processEvent(event)

    // RevenueCat expects a 200 OK
    return res.status(200).json({ received: true })
  } catch (_error) {
    return next(new ApiError(500, 'Failed to process webhook'))
  }
}
