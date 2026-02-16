import { Router } from 'express'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	createTemplate,
	getAllTemplates,
	getTemplateById,
	deleteTemplate,
	updateTemplate,
	getTemplateByShareId,
} from './template.controller.js'
import { createTemplateSchema, updateTemplateSchema } from './template.validators.js'

const router = Router()

router.route('/').post(validateResource(createTemplateSchema), createTemplate).get(getAllTemplates)

router
	.route('/:id')
	.get(getTemplateById)
	.put(validateResource(updateTemplateSchema), updateTemplate)
	.delete(deleteTemplate)

router.route('/share/:id').get(getTemplateByShareId)

export const templateRoutes = router
