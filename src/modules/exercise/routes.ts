import { Router } from 'express'

import { ROLES as roles } from '../../constants/roles.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { authorize } from '../../middlewares/authorize.middleware.js'
import { upload } from '../../middlewares/upload.middleware.js'
import { validateResource } from '../../middlewares/validate.middleware.js'

import {
  createExercise,
  deleteExercise,
  getAllExercises,
  getExerciseById,
  updateExercise,
} from './controller.js'
import { createExerciseSchema, updateExerciseSchema } from './validators.js'

const router = Router()

// LIST & GET

router.route('/').get(getAllExercises)
router.route('/:id').get(getExerciseById)

// CREATE

router
  .route('/')
  .post(
    authenticate,
    authorize(roles.systemAdmin),
    upload.single('video'),
    validateResource(createExerciseSchema),
    createExercise,
  )

// UPDATE & DELETE

router
  .route('/:id')
  .put(
    authenticate,
    authorize(roles.systemAdmin),
    upload.single('video'),
    validateResource(updateExerciseSchema),
    updateExercise,
  )
  .delete(authenticate, authorize(roles.systemAdmin), deleteExercise)

export const exerciseRoutes = router
