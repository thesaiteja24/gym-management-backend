import { Router } from 'express'
import { refreshToken, sendOTP, verifyOTP } from '../controllers/auth.controllers.js'

const router = Router()

router.route('/send-otp').post(sendOTP)
router.route('/verify-otp').post(verifyOTP)
router.route('/refresh-token').post(refreshToken)

export const authRoutes = router
