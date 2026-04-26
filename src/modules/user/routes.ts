import { Router } from 'express'

import { authenticateOptional } from '../../middlewares/auth.middleware.js'

import { getUser } from './controller.js'

const router = Router()

// single user
router.route('/:userId').get(authenticateOptional, getUser)

export const userRoutes = router
