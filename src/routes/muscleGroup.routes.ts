import { Router } from 'express'
import {
	createMuscleGroup,
	deleteMuscleGroup,
	getAllMuscleGroups,
	getMuscleGroupById,
	updateMuscleGroup,
} from '../controllers/muscleGroup.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'
import { authorize } from '../middlewares/authorize.middleware.js'
import { ROLES as roles } from '../constants/roles.js'
import { validateResource } from '../middlewares/validate.middleware.js'
import { createMuscleGroupSchema, updateMuscleGroupSchema } from '../validators/muscleGroup.validators.js'
import { authenticate } from '../middlewares/auth.middleware.js'

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
