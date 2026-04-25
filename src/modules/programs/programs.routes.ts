import { Router } from 'express'

import { validateResource } from '../../middlewares/validate.middleware.js'

import {
  createProgram,
  getAllPrograms,
  getProgramById,
  editProgram,
  deleteProgram,
} from './programs.controller.js'
import {
  createProgramSchema,
  getProgramsSchema,
  getProgramByIdSchema,
  updateProgramSchema,
  deleteProgramSchema,
} from './programs.validators.js'

const router = Router()

router
  .route('/')
  .post(validateResource(createProgramSchema), createProgram)
  .get(validateResource(getProgramsSchema), getAllPrograms)

router
  .route('/:programId')
  .get(validateResource(getProgramByIdSchema), getProgramById)
  .put(validateResource(updateProgramSchema), editProgram)
  .delete(validateResource(deleteProgramSchema), deleteProgram)

export const programRoutes = router
