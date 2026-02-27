import { Router } from 'express'
import { getGoogleClientId } from './config.controller.js'

const router = Router()

router.route('/google-client-id').get(getGoogleClientId)

export const configRoutes = router
