import { Router } from 'express'

import { authorize } from '../../middlewares/authorize.middleware.js'
import { validateResource } from '../../middlewares/validate.middleware.js'
import { followUserSchema } from '../user/user.validators.js'

import {
  createComment,
  deleteComment,
  editComment,
  followUser,
  getComments,
  getLikes,
  getSuggestedUsers,
  getUserFollowers,
  getUserFollowing,
  searchUsers,
  toggleLikeAction,
  unFollowUser,
} from './controller.js'
import {
  createCommentSchema,
  deleteCommentSchema,
  editCommentSchema,
  getCommentsSchema,
  getLikesSchema,
  getUserFollowSchema,
  searchUsersSchema,
  toggleLikeSchema,
} from './validators.js'

const router = Router()

router
  .route('/:userId/follow')
  .post(
    authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
    validateResource(followUserSchema),
    followUser,
  )
  .delete(
    authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
    validateResource(followUserSchema),
    unFollowUser,
  )

router.get(
  '/:userId/followers',
  authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
  validateResource(getUserFollowSchema),
  getUserFollowers,
)
router.get(
  '/:userId/following',
  authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
  validateResource(getUserFollowSchema),
  getUserFollowing,
)

router
  .route('/search')
  .get(
    validateResource(searchUsersSchema),
    authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
    searchUsers,
  )

router
  .route('/suggestions')
  .get(authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'), getSuggestedUsers)

router
  .route('/:id/comments')
  .get(validateResource(getCommentsSchema), getComments)
  .post(validateResource(createCommentSchema), createComment)

router
  .route('/comments/:commentId')
  .put(validateResource(editCommentSchema), editComment)
  .delete(validateResource(deleteCommentSchema), deleteComment)

// Unified Like Routes
router.put(
  '/:id/like',
  authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
  validateResource(toggleLikeSchema),
  toggleLikeAction,
)
router.get(
  '/:id/likes',
  authorize('systemAdmin', 'gymAdmin', 'trainer', 'member'),
  validateResource(getLikesSchema),
  getLikes,
)

export const engagementRoutes = router
