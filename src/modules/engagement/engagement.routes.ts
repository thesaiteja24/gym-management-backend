import { Router } from 'express'
import { authorize } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { followUserSchema } from '../user/user.validators.js'
import {
	createComment,
	createCommentLike,
	createWorkoutLike,
	deleteComment,
	deleteCommentLike,
	deleteWorkoutLike,
	editComment,
	followUser,
	getCommentLikes,
	getComments,
	getSuggestedUsers,
	getUserFollowers,
	getUserFollowing,
	getWorkoutLikes,
	searchUsers,
	unFollowUser,
} from './engagement.controller.js'
import {
	createCommentSchema,
	editCommentSchema,
	getCommentsSchema,
	getUserFollowSchema,
	LikesSchema,
	searchUsersSchema,
} from './engagement.validators.js'

const router = Router()

router
	.route('/:id/follow')
	.post(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), followUser)
	.delete(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), unFollowUser)

router.get(
	'/:userId/followers',
	authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
	validateResource(getUserFollowSchema),
	getUserFollowers
)
router.get(
	'/:userId/following',
	authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
	validateResource(getUserFollowSchema),
	getUserFollowing
)

router
	.route('/search')
	.get(validateResource(searchUsersSchema), authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), searchUsers)

router.route('/suggestions').get(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getSuggestedUsers)


router
	.route('/:id/comments')
	.post(validateResource(createCommentSchema), createComment)
	.get(validateResource(getCommentsSchema), getComments)

router
	.route('/comments/:id')
	.delete(validateResource(getCommentsSchema), deleteComment)
	.put(validateResource(editCommentSchema), editComment)

router
	.route('/:id/like/workout')
	.post(validateResource(LikesSchema), createWorkoutLike)
	.get(validateResource(LikesSchema), getWorkoutLikes)
	.delete(validateResource(LikesSchema), deleteWorkoutLike)

router
	.route('/:id/like/comment')
	.post(validateResource(LikesSchema), createCommentLike)
	.get(validateResource(LikesSchema), getCommentLikes)
	.delete(validateResource(LikesSchema), deleteCommentLike)

export const engagementRoutes = router
