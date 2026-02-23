import { Router } from 'express'
import {
	createComment,
	deleteComment,
	followUser,
	getComments,
	getUserFollowers,
	getUserFollowing,
	unFollowUser,
} from './engagement.controller.js'
import { authorize } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { followUserSchema } from '../user/user.validators.js'
import { createCommentSchema, getCommentsSchema, getRepliesSchema } from './engagement.validators.js'

const router = Router()

router
	.route('/:id/follow')
	.post(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), followUser)
	.delete(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), unFollowUser)

router.get('/:id/followers', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getUserFollowers)
router.get('/:id/following', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getUserFollowing)

router
	.route('/:id/comments')
	.post(validateResource(createCommentSchema), createComment)
	.get(validateResource(getCommentsSchema), getComments)
	.delete(validateResource(getCommentsSchema), deleteComment)
// .put(validateResource(getCommentsSchema))

export const engagementRoutes = router
