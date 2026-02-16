import { Router } from 'express'
import {
	createMuscleGroup,
	deleteMuscleGroup,
	getAllMuscleGroups,
	getMuscleGroupById,
	updateMuscleGroup,
} from './muscleGroup.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorize } from '../../common/middlewares/authorize.middleware.js'
import { ROLES as roles } from '../../common/constants/roles.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { createMuscleGroupSchema, updateMuscleGroupSchema } from './muscleGroup.validators.js'
import { authenticate } from '../../common/middlewares/auth.middleware.js'

const router = Router()

router.route('/').get(getAllMuscleGroups)
router.route('/:id').get(getMuscleGroupById)
router
	.route('/')
	.post(
		authenticate,
		upload.single('image'),
		validateResource(createMuscleGroupSchema),
		authorize(roles.systemAdmin),
		createMuscleGroup
	)
router
	.route('/:id')
	.put(
		authenticate,
		upload.single('image'),
		validateResource(updateMuscleGroupSchema),
		authorize(roles.systemAdmin),
		updateMuscleGroup
	)
router.route('/:id').delete(authenticate, authorize(roles.systemAdmin), deleteMuscleGroup)

export const muscleGroupRoutes = router
