import { Router } from 'express'
import { startChat, streamTTS } from '../controllers/coach.controllers.js'
import { authenticate } from '../middlewares/auth.middleware.js'

const router = Router()

router.route('/start').get(authenticate, startChat)
router.route('/tts/:id').get(streamTTS)

export const coachRoutes = router
