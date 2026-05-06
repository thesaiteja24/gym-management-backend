import { Router } from 'express'

import { validateResource } from '../../../middlewares/validate.middleware.js'
import * as controller from '../controller.js'
import * as validators from '../validators.js'

const router = Router()

router.get('/', controller.listUserPrograms)

router.get('/active', controller.getActiveUserProgram)

router.post(
  '/:programId/start',
  validateResource(validators.startProgramSchema),
  controller.startProgram,
)

router.get(
  '/:userProgramId',
  validateResource(validators.getUserProgramSchema),
  controller.getUserProgramById,
)

export const userProgramRoutes = router
