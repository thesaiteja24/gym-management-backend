import { Router } from 'express'
import { deleteProfilePic, getUser, updateProfilePic, updateUser, updateUserFitnessProfile } from './user.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { updateFitnessProfileSchema, updateProfilePicSchema, updateUserSchema } from './user.validators.js'

const router = Router()

router.route('/:id').get(getUser)
router.route('/:id').patch(validateResource(updateUserSchema), authorizeSelfOrAdmin(), updateUser)
router
	.route('/:id/profile-picture')
	.patch(
		upload.single('profilePic'),
		validateResource(updateProfilePicSchema),
		authorizeSelfOrAdmin(),
		updateProfilePic
	)
router
	.route('/:id/profile-picture')
	.delete(validateResource(updateProfilePicSchema), authorizeSelfOrAdmin(), deleteProfilePic)
router
	.route('/:id/fitness-profile')
	.patch(validateResource(updateFitnessProfileSchema), authorizeSelfOrAdmin(), updateUserFitnessProfile)

export const userRoutes = router
