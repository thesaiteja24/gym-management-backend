import { Router } from 'express'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { getUser } from './user.controller.js'
import {
	getActiveUserProgramSchema,
	getUserProgramSchema,
	listUserProgramsSchema,
	startProgramSchema,
} from '../programs/programs.validators.js'
import {
	getActiveUserProgram,
	getUserProgramById,
	listUserPrograms,
	startProgram,
} from '../programs/programs.controller.js'

const router = Router()

// single user
router.route('/:userId').get(getUser)

router.route('/:userId/programs').get(validateResource(listUserProgramsSchema), listUserPrograms)
router.route('/:userId/programs/active').get(validateResource(getActiveUserProgramSchema), getActiveUserProgram)
router.route('/:userId/programs/:userProgramId').get(validateResource(getUserProgramSchema), getUserProgramById)
router.route('/:userId/programs/:programId').post(validateResource(startProgramSchema), startProgram)

export const userRoutes = router
