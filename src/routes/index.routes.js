import { Router } from 'express'
import { healthCheckRoutes } from './healthCheck.routes.js'
import { authRoutes } from './auth.routes.js'
import { userRoutes } from './user.routes.js'
import { authenticate } from '../middlewares/auth.middleware.js'

const router = Router()

router.use('/health', healthCheckRoutes)
router.use('/auth', authRoutes)
router.use('/users', authenticate, userRoutes)

export const indexRoutes = router
