import { Router } from 'express'
import { deleteProfilePic, getUser, updateProfilePic, updateUser } from '../controllers/user.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'
import { authorizeSelfOrAdmin } from '../middlewares/authorize.middleware.js'
import { validateResource } from '../middlewares/validate.middleware.js'
import { updateProfilePicSchema, updateUserSchema } from '../validators/user.validators.js'

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

export const userRoutes = router
