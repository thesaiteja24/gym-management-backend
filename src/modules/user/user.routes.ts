import { Router } from 'express'
import {
	deleteProfilePic,
	followUser,
	getSuggestedUsers,
	getUser,
	getUserFollowers,
	getUserFollowing,
	searchUsers,
	unFollowUser,
	updateProfilePic,
	updateUser,
	updateUserFitnessProfile,
} from './user.controller.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { authorize, authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	followUserSchema,
	searchUsersSchema,
	updateFitnessProfileSchema,
	updateProfilePicSchema,
	updateUserSchema,
} from './user.validators.js'

const router = Router()

router.get(
	'/search',
	validateResource(searchUsersSchema),
	authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
	searchUsers
)
router.get('/suggestions', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getSuggestedUsers)

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
	.post(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), followUser)
	.delete(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), unFollowUser)

router.get('/:id/followers', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getUserFollowers)
router.get('/:id/following', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getUserFollowing)

export const userRoutes = router
