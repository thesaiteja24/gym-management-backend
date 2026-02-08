import { Router } from 'express'
import { answerQuestion, askCoach, startChat, streamTTS } from '../controllers/coach.controllers.js'
import { authenticate } from '../middlewares/auth.middleware.js'
import { upload } from '../middlewares/upload.middleware.js'

const router = Router()

router.route('/tts/:id').get(streamTTS)
router.route('/start').get(authenticate, startChat)
router.route('/ask').post(authenticate, upload.single('audioFile'), askCoach)
router.route('/answer').post(authenticate, answerQuestion)

export const coachRoutes = router
