import { Router } from 'express'
import { healthCheckRoutes } from './healthCheck.routes.js'
import { authenticate } from '../middlewares/auth.middleware.js'
import { authRoutes } from './auth.routes.js'
import { userRoutes } from './user.routes.js'
import { equipmentRoutes } from './equipment.routes.js'
import { muscleGroupRoutes } from './muscleGroup.routes.js'
import { exerciseRoutes } from './exercise.routes.js'
import { workoutRoutes } from './workout.routes.js'
import { templateRoutes } from './template.routes.js'
import { coachRoutes } from './coach.routes.js'

const router = Router()

router.use('/health', healthCheckRoutes)
router.use('/auth', authRoutes)
router.use('/users', authenticate, userRoutes)
router.use('/equipment', equipmentRoutes)
router.use('/muscle-groups', muscleGroupRoutes)
router.use('/exercises', exerciseRoutes)
router.use('/workouts', authenticate, workoutRoutes)
router.use('/templates', authenticate, templateRoutes)
router.use('/coach', coachRoutes)

export const indexRoutes = router
