import { Router } from 'express'
import {
	createEquipment,
	deleteEquipment,
	getAllEquipment,
	updateEquipment,
} from '../controllers/equipment.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'
import { authorize } from '../middlewares/authorize.middleware.js'
import { ROLES as roles } from '../constants/roles.js'

const router = Router()

router.route('/').post(upload.single('image'), authorize(roles.systemAdmin), createEquipment)
router.route('/').get(getAllEquipment)
router.route('/:id').put(upload.single('image'), authorize(roles.systemAdmin), updateEquipment)
router.route('/:id').delete(authorize(roles.systemAdmin), deleteEquipment)

export const equipmentRoutes = router
