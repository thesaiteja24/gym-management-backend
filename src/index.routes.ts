import { Router } from 'express'

import { authenticate } from './middlewares/auth.middleware.js'
import { authRoutes } from './modules/auth/routes.js'
import { coachRoutes } from './modules/coach/coach.routes.js'
import { configRoutes } from './modules/config/config.routes.js'
import { engagementRoutes } from './modules/engagement/routes.js'
import { exerciseRoutes } from './modules/exercise/exercise.routes.js'
import { habitRoutes } from './modules/habit/habit.routes.js'
import { healthCheckRoutes } from './modules/healthCheck/healthCheck.routes.js'
import { meRoutes } from './modules/me/routes.js'
import { metaRoutes } from './modules/meta/meta.routes.js'
import { programRoutes } from './modules/programs/programs.routes.js'
import { templateRoutes } from './modules/template/template.routes.js'
import { userRoutes } from './modules/user/routes.js'
import { revenueCatWebhookHandler } from './modules/webhooks/revenuecat.controller.js'
import { getWorkoutByShareId } from './modules/workout/workout.controller.js'
import { workoutRoutes } from './modules/workout/workout.routes.js'

const router = Router()

router.use('/health', healthCheckRoutes)
router.use('/auth', authRoutes)
router.use('/me', authenticate, meRoutes)
router.use('/users', authenticate, userRoutes)
router.use('/meta', metaRoutes)
router.use('/exercises', exerciseRoutes)
router.get('/workouts/share/:id', getWorkoutByShareId)
router.use('/workouts', authenticate, workoutRoutes)
router.use('/templates', authenticate, templateRoutes)
router.use('/coach', authenticate, coachRoutes)
router.use('/engagement', authenticate, engagementRoutes)
router.use('/config', configRoutes)
router.use('/habits', authenticate, habitRoutes)
router.use('/programs', authenticate, programRoutes)

// Webhooks (no custom internal authentication, uses its own auth headers)
router.post('/webhooks/revenuecat', revenueCatWebhookHandler)

export const indexRoutes = router
