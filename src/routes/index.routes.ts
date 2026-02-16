import { Router } from 'express'
import { healthCheckRoutes } from '../modules/healthCheck/healthCheck.routes.js'
import { authenticate } from '../common/middlewares/auth.middleware.js'
import { authRoutes } from '../modules/auth/auth.routes.js'
import { userRoutes } from '../modules/user/user.routes.js'
import { equipmentRoutes } from '../modules/equipment/equipment.routes.js'
import { muscleGroupRoutes } from '../modules/muscleGroup/muscleGroup.routes.js'
import { exerciseRoutes } from '../modules/exercise/exercise.routes.js'
import { workoutRoutes } from '../modules/workout/workout.routes.js'
import { templateRoutes } from '../modules/template/template.routes.js'
import { coachRoutes } from '../modules/coach/coach.routes.js'

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
