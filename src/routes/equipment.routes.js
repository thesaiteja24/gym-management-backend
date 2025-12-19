import { Router } from 'express'
import { createEquipment, deleteEquipment, getAllEquipment } from '../controllers/equipment.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'

const router = Router()

router.route('/').post(upload.single('image'), createEquipment)
router.route('/').get(getAllEquipment)
// router.route('/:id').put()
router.route('/:id').delete(deleteEquipment)

export const equipmentRoutes = router
