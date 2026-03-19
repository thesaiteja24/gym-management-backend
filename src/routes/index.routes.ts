import { Router } from 'express'
import { authenticate } from '../common/middlewares/auth.middleware.js'
import { analyticRoutes } from '../modules/analytics/analytics.routes.js'
import { authRoutes } from '../modules/auth/auth.routes.js'
import { coachRoutes } from '../modules/coach/coach.routes.js'
import { configRoutes } from '../modules/config/config.routes.js'
import { discoverRoutes } from '../modules/discover/discover.routes.js'
import { engagementRoutes } from '../modules/engagement/engagement.routes.js'
import { equipmentRoutes } from '../modules/equipment/equipment.routes.js'
import { exerciseRoutes } from '../modules/exercise/exercise.routes.js'
import { healthCheckRoutes } from '../modules/healthCheck/healthCheck.routes.js'
import { muscleGroupRoutes } from '../modules/muscleGroup/muscleGroup.routes.js'
import { templateRoutes } from '../modules/template/template.routes.js'
import { userRoutes } from '../modules/user/user.routes.js'
import { getWorkoutByShareId } from '../modules/workout/workout.controller.js'
import { workoutRoutes } from '../modules/workout/workout.routes.js'
import { webhookRoutes } from './webhook.routes.js'

const router = Router()

router.use('/health', healthCheckRoutes)
router.use('/auth', authRoutes)
router.use('/users', authenticate, userRoutes)
router.use('/equipment', equipmentRoutes)
router.use('/muscle-groups', muscleGroupRoutes)
router.use('/exercises', exerciseRoutes)
router.get('/workouts/share/:id', getWorkoutByShareId)
router.use('/workouts', authenticate, workoutRoutes)
router.use('/templates', authenticate, templateRoutes)
router.use('/coach', authenticate, coachRoutes)
router.use('/discover', authenticate, discoverRoutes)
router.use('/engagement', authenticate, engagementRoutes)
router.use('/config', configRoutes)
router.use('/analytics', authenticate, analyticRoutes)

// Webhooks (no custom internal authentication, uses its own auth headers)
router.use('/webhooks', webhookRoutes)

export const indexRoutes = router
