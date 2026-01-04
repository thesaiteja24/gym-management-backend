import { Router } from 'express'
import { createWorkout, getAllWorkouts } from '../controllers/workout.controllers.js'
import { ROLES as roles } from '../constants/roles.js'
import { authorizeSelfOrAdmin } from '../middlewares/authorize.middleware.js'
const router = Router()

router.route('/').get(getAllWorkouts)
router.route('/').post(createWorkout)

export const workoutRoutes = router
