import { Router } from 'express'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { deleteProfilePic, getUser, updateProfilePic, updateUser } from './user.controller.js'
import { updateProfilePicSchema, updateUserSchema } from './user.validators.js'
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
router
	.route('/:userId')
	.get(getUser)
	.patch(validateResource(updateUserSchema), authorizeSelfOrAdmin('userId'), updateUser)

// profile picture
router
	.route('/:id/profile-picture')
	.patch(
		upload.single('profilePic'),
		validateResource(updateProfilePicSchema),
		authorizeSelfOrAdmin(),
		updateProfilePic
	)
	.delete(validateResource(updateProfilePicSchema), authorizeSelfOrAdmin(), deleteProfilePic)

router.route('/:userId/programs').get(validateResource(listUserProgramsSchema), listUserPrograms)
router.route('/:userId/programs/active').get(validateResource(getActiveUserProgramSchema), getActiveUserProgram)
router.route('/:userId/programs/:userProgramId').get(validateResource(getUserProgramSchema), getUserProgramById)
router.route('/:userId/programs/:programId').post(validateResource(startProgramSchema), startProgram)

export const userRoutes = router
