import { Router } from 'express'
import { sendOTP, verifyOTP } from '../controllers/auth.controllers.js'

const router = Router()

router.route('/send-otp').post(sendOTP)
router.route('/verify-otp').post(verifyOTP)

export const authRoutes = router
