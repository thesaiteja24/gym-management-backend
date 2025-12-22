import { Router } from 'express'
import { createMuscleGroup, getAllMuscleGroups } from '../controllers/muscleGroup.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'

const router = Router()

router.route('/').post(upload.single('image'), createMuscleGroup)
router.route('/').get(getAllMuscleGroups)

export const muscleGroupRoutes = router
