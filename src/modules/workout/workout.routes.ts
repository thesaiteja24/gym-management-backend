import { Router } from 'express'

import { validateResource } from '../../middlewares/validate.middleware.js'

import * as workoutController from './workout.controllers.js'
import { createWorkoutSchema, updateWorkoutSchema } from './validators.js'

const router = Router()

router
  .route('/')
  .get(workoutController.listWorkouts)
  .post(validateResource(createWorkoutSchema), workoutController.createWorkout)
router.route('/share/:id').get(workoutController.getWorkoutByShareId)

router
  .route('/:id')
  .get(workoutController.getWorkoutById)
  .put(validateResource(updateWorkoutSchema), workoutController.updateWorkout)
  .delete(workoutController.deleteWorkout)

export const workoutRoutes = router
