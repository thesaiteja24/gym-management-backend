import { Router } from 'express'
import { createWorkout, deleteWorkout, getAllWorkouts, updateWorkout } from '../controllers/workout.controllers.js'

const router = Router()

router.route('/').get(getAllWorkouts)
router.route('/').post(createWorkout)
router.route('/:id').put(updateWorkout)
router.route('/:id').delete(deleteWorkout)

export const workoutRoutes = router
