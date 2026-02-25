import { Router } from 'express'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	createWorkout,
	deleteWorkout,
	getAllWorkouts,
	getDiscoverWorkouts,
	getWorkoutByShareId,
	updateWorkout,
} from './workout.controller.js'
import { createWorkoutSchema, updateWorkoutSchema } from './workout.validators.js'

const router = Router()

router.route('/').get(getAllWorkouts)
router.route('/discover').get(getDiscoverWorkouts)
router.route('/share/:id').get(getWorkoutByShareId)
router.route('/').post(validateResource(createWorkoutSchema), createWorkout)
router.route('/:id').put(validateResource(updateWorkoutSchema), updateWorkout)
router.route('/:id').delete(deleteWorkout)

export const workoutRoutes = router
