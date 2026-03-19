import { Router } from 'express'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	addMeasurements,
	getFitnessProfile,
	getMeasurements,
	getNutritionPlan,
	getUserAnalytics,
	updateFitnessProfile,
	updateNutritionPlan,
} from './analytics.controller.js'
import {
	addDailyMeasurementSchema,
	updateFitnessProfileSchema,
	updateNutritionPlanSchema,
} from './analytics.validators.js'

const router = Router()

// fitness profile
router
	.route('/fitness-profile/:id')
	.put(validateResource(updateFitnessProfileSchema), authorizeSelfOrAdmin(), updateFitnessProfile)
	.get(authorizeSelfOrAdmin(), getFitnessProfile)

// user measurements
router
	.route('/measurements/:id')
	.post(
		upload.array('progressPics', 10),
		validateResource(addDailyMeasurementSchema),
		authorizeSelfOrAdmin(),
		addMeasurements
	)
	.get(authorizeSelfOrAdmin(), getMeasurements)

router
	.route('/nutrition-plan/:id')
	.get(authorizeSelfOrAdmin(), getNutritionPlan)
	.put(validateResource(updateNutritionPlanSchema), authorizeSelfOrAdmin(), updateNutritionPlan)

router.route('/user-analytics/:id').get(authorizeSelfOrAdmin(), getUserAnalytics)

export const analyticRoutes = router
