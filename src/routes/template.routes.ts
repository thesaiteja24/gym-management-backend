import { Router } from 'express'
import { validateResource } from '../middlewares/validate.middleware.js'
import {
	createTemplate,
	getAllTemplates,
	getTemplateById,
	deleteTemplate,
	updateTemplate,
	getTemplateByShareId,
} from '../controllers/template.controllers.js'
import { createTemplateSchema, updateTemplateSchema } from '../validators/template.validators.js'

const router = Router()

router.route('/').post(validateResource(createTemplateSchema), createTemplate).get(getAllTemplates)

router
	.route('/:id')
	.get(getTemplateById)
	.put(validateResource(updateTemplateSchema), updateTemplate)
	.delete(deleteTemplate)

router.route('/share/:id').get(getTemplateByShareId)

export const templateRoutes = router
