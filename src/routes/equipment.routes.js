import { Router } from 'express'
import { createEquipment } from '../controllers/equipment.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'

const router = Router()

router.route('/').post(upload.single('image'), createEquipment)

export const equipmentRoutes = router
