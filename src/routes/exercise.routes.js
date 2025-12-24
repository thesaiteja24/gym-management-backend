import { Router } from 'express'
import {
	createExercise,
	deleteExercise,
	getAllExercises,
	getExerciseById,
	updateExercise,
} from '../controllers/exercise.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'
import { authorize } from '../middlewares/authorize.middleware.js'
import { ROLES as roles } from '../constants/roles.js'

const router = Router()

router.route('/').get(getAllExercises)
router.route('/:id').get(getExerciseById)
router.route('/').post(upload.single('video'), authorize(roles.systemAdmin), createExercise)
router.route('/:id').put(upload.single('video'), authorize(roles.systemAdmin), updateExercise)
router.route('/:id').delete(authorize(roles.systemAdmin), deleteExercise)

export const exerciseRoutes = router
