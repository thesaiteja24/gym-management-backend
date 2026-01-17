import { Router } from 'express'
import { refreshToken, sendOTP, verifyOTP } from '../controllers/auth.controllers.js'
import { validateResource } from '../middlewares/validate.middleware.js'
import { refreshTokenSchema, sendOTPSchema, verifyOTPSchema } from '../validators/auth.validators.js'

const router = Router()

router.route('/send-otp').post(validateResource(sendOTPSchema), sendOTP)
router.route('/verify-otp').post(validateResource(verifyOTPSchema), verifyOTP)
router.route('/refresh-token').post(validateResource(refreshTokenSchema), refreshToken)

export const authRoutes = router
