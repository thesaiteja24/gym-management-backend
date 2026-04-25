import { Router } from 'express'

import { validateResource } from '../../middlewares/validate.middleware.js'

import {
  createWorkout,
  deleteWorkout,
  getAllWorkouts,
  getDiscoverWorkouts,
  getWorkoutById,
  getWorkoutByShareId,
  updateWorkout,
} from './workout.controller.js'
import { createWorkoutSchema, updateWorkoutSchema } from './workout.validators.js'

const router = Router()

router.route('/').get(getAllWorkouts).post(validateResource(createWorkoutSchema), createWorkout)

router.route('/discover').get(getDiscoverWorkouts)
router.route('/share/:id').get(getWorkoutByShareId)

router
  .route('/:id')
  .get(getWorkoutById)
  .put(validateResource(updateWorkoutSchema), updateWorkout)
  .delete(deleteWorkout)

export const workoutRoutes = router
