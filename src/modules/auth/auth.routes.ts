import { Router } from 'express'

import { validateResource } from '../../common/middlewares/validate.middleware.js'

import { googleLogin, refreshToken } from './auth.controller.js'
import { refreshTokenSchema } from './auth.validators.js'

const router = Router()

router.route('/refresh-token').post(validateResource(refreshTokenSchema), refreshToken)
router.route('/google').post(googleLogin)

export const authRoutes = router
