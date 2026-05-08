import { Router } from 'express'

import { authenticateOptional } from '../../middlewares/auth.middleware.js'

import { getUser, nudgeUser } from './user.controllers.js'

const router = Router()

// single user
router.route('/:userId').get(authenticateOptional, getUser)
router.route('/:userId/nudge').post(nudgeUser)

export const userRoutes = router
