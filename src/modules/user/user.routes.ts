import { Router } from 'express'

import { authenticateOptional } from '../../middlewares/auth.middleware.js'

import { getTopLifts, getUser, nudgeUser } from './user.controllers.js'

const router = Router()

// single user
router.route('/:userId').get(authenticateOptional, getUser)
router.route('/:userId/nudge').post(nudgeUser)

// analytics
router.route('/:userId/analytics/top-lifts').get(authenticateOptional, getTopLifts)

export const userRoutes = router
