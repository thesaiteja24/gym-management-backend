import { Router } from 'express'
import { askCoach, startChat, streamTTS } from '../controllers/coach.controllers.js'
import { authenticate } from '../middlewares/auth.middleware.js'
import { upload } from '../middlewares/upload.middleware.js'

const router = Router()

router.route('/start').get(authenticate, startChat)
router.route('/ask').post(authenticate, upload.single('audioFile'), askCoach)
router.route('/tts/:id').get(streamTTS)

export const coachRoutes = router
