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

const router = Router()

router.route('/').get(getAllMuscleGroups)
router.route('/:id').get(getMuscleGroupById)
router.route('/').post(upload.single('image'), authorize(roles.systemAdmin), createMuscleGroup)
router.route('/:id').put(upload.single('image'), authorize(roles.systemAdmin), updateMuscleGroup)
router.route('/:id').delete(authorize(roles.systemAdmin), deleteMuscleGroup)

export const muscleGroupRoutes = router
