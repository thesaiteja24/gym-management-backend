import { Router } from 'express'
import { createWorkout, deleteWorkout, getAllWorkouts, updateWorkout } from '../controllers/workout.controllers.js'
import { validateResource } from '../middlewares/validate.middleware.js'
import { createWorkoutSchema, updateWorkoutSchema } from '../validators/workout.validators.js'

const router = Router()

router.route('/').get(getAllWorkouts)
router.route('/').post(validateResource(createWorkoutSchema), createWorkout)
router.route('/:id').put(validateResource(updateWorkoutSchema), updateWorkout)
router.route('/:id').delete(deleteWorkout)

export const workoutRoutes = router
