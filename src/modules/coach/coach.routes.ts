import { Router } from 'express'
import {
	getActiveConversation,
	sendMessage,
	startConversation,
	streamSpeech,
	transcribeMessage,
} from './coach.controller.js'
import { authenticate } from '../../common/middlewares/auth.middleware.js'
import { upload } from '../../common/middlewares/upload.middleware.js'

const router = Router()

router.route('/speech/:id').get(streamSpeech) // stream speech
router.route('/transcriptions').post(authenticate, upload.single('audioFile'), transcribeMessage) // transcribe audio

router.route('/conversations/active').get(authenticate, getActiveConversation) // get active conversation
router.route('/conversations').post(authenticate, startConversation) // start fresh conversation
router.route('/conversations/:id/messages').post(authenticate, sendMessage) // send message
router.route('/conversations/:id').delete(authenticate) // delete conversation

export const coachRoutes = router
