import { Router } from 'express'
import {
	createEquipment,
	deleteEquipment,
	getAllEquipment,
	getEquipmentById,
	updateEquipment,
} from '../controllers/equipment.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'
import { authorize } from '../middlewares/authorize.middleware.js'
import { ROLES as roles } from '../constants/roles.js'
import { validateResource } from '../middlewares/validate.middleware.js'
import { createEquipmentSchema, updateEquipmentSchema } from '../validators/equipment.validators.js'

const router = Router()

router.route('/').get(getAllEquipment)
router.route('/:id').get(getEquipmentById)
router
	.route('/')
	.post(
		upload.single('image'),
		validateResource(createEquipmentSchema),
		authorize(roles.systemAdmin),
		createEquipment
	)
router
	.route('/:id')
	.put(upload.single('image'), validateResource(updateEquipmentSchema), authorize(roles.systemAdmin), updateEquipment)
router.route('/:id').delete(authorize(roles.systemAdmin), deleteEquipment)

export const equipmentRoutes = router
