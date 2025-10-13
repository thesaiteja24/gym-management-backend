import { Router } from 'express'
import { healthCheckRoutes } from './healthCheck.routes.js'
import { authRoutes } from './auth.routes.js'

const router = Router()

router.use('/health', healthCheckRoutes)
router.use('/auth', authRoutes)

export const indexRoutes = router
