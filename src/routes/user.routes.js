import { Router } from 'express'
import { getUser } from '../controllers/user.controllers.js'

const router = Router()

router.route('/:id').get(getUser)

export const userRoutes = router
