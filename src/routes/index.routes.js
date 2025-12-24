import { Router } from 'express'
import { healthCheckRoutes } from './healthCheck.routes.js'
import { authenticate } from '../middlewares/auth.middleware.js'
import { authRoutes } from './auth.routes.js'
import { userRoutes } from './user.routes.js'
import { equipmentRoutes } from './equipment.routes.js'
import { muscleGroupRoutes } from './muscleGroup.routes.js'
import { exerciseRoutes } from './exercise.routes.js'

const router = Router()

router.use('/health', healthCheckRoutes)
router.use('/auth', authRoutes)
router.use('/users', authenticate, userRoutes)
router.use('/equipment', authenticate, equipmentRoutes)
router.use('/muscle-group', authenticate, muscleGroupRoutes)
router.use('/exercise', authenticate, exerciseRoutes)

export const indexRoutes = router
