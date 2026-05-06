import { Router } from 'express'

import { authenticate } from '../../../middlewares/auth.middleware.js'
import { validateResource } from '../../../middlewares/validate.middleware.js'
import * as controller from '../controller.js'
import * as validators from '../validators.js'

const router = Router()

router.post(
  '/',
  authenticate,
  validateResource(validators.createProgramSchema),
  controller.createProgram,
)

router.get('/', validateResource(validators.getProgramsSchema), controller.getAllPrograms)

router.get(
  '/:programId',
  validateResource(validators.getProgramByIdSchema),
  controller.getProgramById,
)

router.patch(
  '/:programId',
  authenticate,
  validateResource(validators.updateProgramSchema),
  controller.editProgram,
)

router.delete(
  '/:programId',
  authenticate,
  validateResource(validators.deleteProgramSchema),
  controller.deleteProgram,
)

export const programRoutes = router
