import { Router } from 'express'
import { followUser, getUserFollowers, getUserFollowing, unFollowUser } from './engagement.controller.js'
import { authorize } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { followUserSchema } from '../user/user.validators.js'

const router = Router()

router
	.route('/:id/follow')
	.post(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), followUser)
	.delete(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), validateResource(followUserSchema), unFollowUser)

router.get('/:id/followers', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getUserFollowers)
router.get('/:id/following', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getUserFollowing)

export const engagementRoutes = router
