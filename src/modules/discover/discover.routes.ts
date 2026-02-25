import { Router } from 'express'
import { getSuggestedUsers, searchUsers } from './discover.controller.js'
import { authorize } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { searchUsersSchema } from '../user/user.validators.js'

const router = Router()

router.get(
	'/search',
	validateResource(searchUsersSchema),
	authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
	searchUsers
)
router.get('/suggestions', authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getSuggestedUsers)

export const discoverRoutes = router
