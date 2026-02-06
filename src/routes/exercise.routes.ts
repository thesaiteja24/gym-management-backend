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
import { validateResource } from '../middlewares/validate.middleware.js'
import { createExerciseSchema, updateExerciseSchema } from '../validators/exercise.validators.js'
import { authenticate } from '../middlewares/auth.middleware.js'

const router = Router()

router.route('/').get(getAllExercises)
router.route('/:id').get(getExerciseById)
router
	.route('/')
	.post(
		authenticate,
		upload.single('video'),
		validateResource(createExerciseSchema),
		authorize(roles.systemAdmin),
		createExercise
	)
router
	.route('/:id')
	.put(
		authenticate,
		upload.single('video'),
		validateResource(updateExerciseSchema),
		authorize(roles.systemAdmin),
		updateExercise
	)
router.route('/:id').delete(authenticate, authorize(roles.systemAdmin), deleteExercise)

export const exerciseRoutes = router
