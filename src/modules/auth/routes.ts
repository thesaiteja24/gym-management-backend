import { Router } from 'express'

import { validateResource } from '../../middlewares/validate.middleware.js'

import { googleLogin, refreshToken } from './controller.js'
import { refreshTokenSchema } from './validators.js'

const router = Router()

router.route('/refresh-token').post(validateResource(refreshTokenSchema), refreshToken)
router.route('/google').post(googleLogin)

export const authRoutes = router
