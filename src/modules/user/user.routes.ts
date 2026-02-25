import { Router } from 'express'
import { deleteProfilePic, getUser, updateProfilePic, updateUser, updateUserFitnessProfile } from './user.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorize, authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { updateFitnessProfileSchema, updateProfilePicSchema, updateUserSchema } from './user.validators.js'

const router = Router()

// single user
router.route('/:id').get(getUser).patch(validateResource(updateUserSchema), authorizeSelfOrAdmin(), updateUser)

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

// fitness profile
router.patch(
	'/:id/fitness-profile',
	validateResource(updateFitnessProfileSchema),
	authorizeSelfOrAdmin(),
	updateUserFitnessProfile
)

export const userRoutes = router
