import { Router } from 'express'
import { upload } from '../middlewares/upload.middleware.js'
import { createExercise } from '../controllers/exercise.controllers.js'

const router = Router()

router.route('/').post(upload.single('video'), createExercise)

export const exerciseRoutes = router
