import { Router } from 'express'
import {
	deleteProfilePic,
	getUser,
	searchUsers,
	updateProfilePic,
	updateUser,
	updateUserFitnessProfile,
} from './user.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	searchUsersSchema,
	updateFitnessProfileSchema,
	updateProfilePicSchema,
	updateUserSchema,
} from './user.validators.js'

const router = Router()

// search users
router.route('/search').get(validateResource(searchUsersSchema), authorizeSelfOrAdmin(), searchUsers)
// get user data
router.route('/:id').get(getUser)
// update user data
router.route('/:id').patch(validateResource(updateUserSchema), authorizeSelfOrAdmin(), updateUser)
// update profile picture
router
	.route('/:id/profile-picture')
	.patch(
		upload.single('profilePic'),
		validateResource(updateProfilePicSchema),
		authorizeSelfOrAdmin(),
		updateProfilePic
	)
// delete profile picture
router
	.route('/:id/profile-picture')
	.delete(validateResource(updateProfilePicSchema), authorizeSelfOrAdmin(), deleteProfilePic)
// update fitness profile
router
	.route('/:id/fitness-profile')
	.patch(validateResource(updateFitnessProfileSchema), authorizeSelfOrAdmin(), updateUserFitnessProfile)

export const userRoutes = router
