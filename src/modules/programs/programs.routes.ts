import { Router } from 'express'
import { createProgram, getAllPrograms, getProgramById, editProgram, deleteProgram } from './programs.controller.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	createProgramSchema,
	getProgramsSchema,
	getProgramByIdSchema,
	updateProgramSchema,
	deleteProgramSchema,
} from './programs.validators.js'

const router = Router()

router
	.route('/:userId')
	.post(validateResource(createProgramSchema), createProgram)
	.get(validateResource(getProgramsSchema), getAllPrograms)

router
	.route('/:userId/:programId')
	.get(validateResource(getProgramByIdSchema), getProgramById)
	.put(validateResource(updateProgramSchema), editProgram)
	.delete(validateResource(deleteProgramSchema), deleteProgram)

export const programRoutes = router
