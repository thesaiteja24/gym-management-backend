import { Router } from 'express'
import { revenueCatWebhookHandler } from '../modules/webhooks/revenuecat.controller.js'

const webhookRoutes = Router()

webhookRoutes.post('/revenuecat', revenueCatWebhookHandler)

export { webhookRoutes }
