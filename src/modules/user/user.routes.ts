import { Router } from 'express'

import { authenticateOptional } from '../../middlewares/auth.middleware.js'

import { getTopLifts, getTrainingAnalytics, getUser, nudgeUser } from './user.controllers.js'

const router = Router()

// single user
router.route('/:userId').get(authenticateOptional, getUser)
router.route('/:userId/nudge').post(nudgeUser)

// analytics
router.route('/:userId/analytics/top-lifts').get(authenticateOptional, getTopLifts)
router.route('/:userId/analytics/training').get(authenticateOptional, getTrainingAnalytics)

export const userRoutes = router
