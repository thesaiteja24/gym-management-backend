import { Router } from 'express'
import {
	createWorkout,
	deleteWorkout,
	getAllWorkouts,
	getDiscoverWorkouts,
	updateWorkout,
} from './workout.controller.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { createWorkoutSchema, updateWorkoutSchema } from './workout.validators.js'

const router = Router()

router.route('/').get(getAllWorkouts)
router.route('/discover').get(getDiscoverWorkouts)
router.route('/').post(validateResource(createWorkoutSchema), createWorkout)
router.route('/:id').put(validateResource(updateWorkoutSchema), updateWorkout)
router.route('/:id').delete(deleteWorkout)

export const workoutRoutes = router
