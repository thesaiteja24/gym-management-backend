import { Router } from 'express'
import {
	deleteProfilePic,
	followUser,
	getSuggestedUsers,
	getUser,
	searchUsers,
	unFollowUser,
	updateProfilePic,
	updateUser,
	updateUserFitnessProfile,
} from './user.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	followUserSchema,
	searchUsersSchema,
	updateFitnessProfileSchema,
	updateProfilePicSchema,
	updateUserSchema,
} from './user.validators.js'

const router = Router()

router.get('/search', validateResource(searchUsersSchema), authorizeSelfOrAdmin(), searchUsers)
router.get('/suggestions', authorizeSelfOrAdmin(), getSuggestedUsers)

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

// follow system
router
	.route('/:id/follow')
	.post(authorizeSelfOrAdmin(), validateResource(followUserSchema), followUser)
	.delete(authorizeSelfOrAdmin(), validateResource(followUserSchema), unFollowUser)

router.get('/:id/followers', authorizeSelfOrAdmin())
router.get('/:id/following', authorizeSelfOrAdmin())

export const userRoutes = router
