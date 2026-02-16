import { Router } from 'express'
import {
	createExercise,
	deleteExercise,
	getAllExercises,
	getExerciseById,
	updateExercise,
} from './exercise.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorize } from '../../common/middlewares/authorize.middleware.js'
import { ROLES as roles } from '../../common/constants/roles.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { createExerciseSchema, updateExerciseSchema } from './exercise.validators.js'
import { authenticate } from '../../common/middlewares/auth.middleware.js'

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
