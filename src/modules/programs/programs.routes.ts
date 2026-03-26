import { Router } from 'express'
import { createProgram, getPrograms, getProgramById, updateProgram, deleteProgram } from './programs.controller.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { createProgramSchema, getProgramsSchema, getProgramByIdSchema, updateProgramSchema, deleteProgramSchema } from './programs.validators.js'

const router = Router()

router
	.route('/:userId')
	.post(validateResource(createProgramSchema), createProgram)
	.get(validateResource(getProgramsSchema), getPrograms)

router
	.route('/:userId/:programId')
	.get(validateResource(getProgramByIdSchema), getProgramById)
	.put(validateResource(updateProgramSchema), updateProgram)
	.delete(validateResource(deleteProgramSchema), deleteProgram)

export const programRoutes = router
