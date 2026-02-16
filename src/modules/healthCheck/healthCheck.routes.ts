import { Router } from 'express'
import { healthCheck } from './healthCheck.controller.js'

const router = Router()

router.route('/').get(healthCheck)

export const healthCheckRoutes = router
