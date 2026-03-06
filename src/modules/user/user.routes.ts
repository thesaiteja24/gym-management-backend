import { Router } from 'express'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { deleteProfilePic, getUser, updateProfilePic, updateUser } from './user.controller.js'
import { updateProfilePicSchema, updateUserSchema } from './user.validators.js'

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

export const userRoutes = router
