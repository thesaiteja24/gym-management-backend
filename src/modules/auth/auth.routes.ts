import { Router } from 'express'
import { googleLogin, refreshToken, sendOTP, verifyOTP } from './auth.controller.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import { refreshTokenSchema, sendOTPSchema, verifyOTPSchema } from './auth.validators.js'

const router = Router()

router.route('/send-otp').post(validateResource(sendOTPSchema), sendOTP)
router.route('/verify-otp').post(validateResource(verifyOTPSchema), verifyOTP)
router.route('/refresh-token').post(validateResource(refreshTokenSchema), refreshToken)
router.route('/google').post(googleLogin)

export const authRoutes = router
