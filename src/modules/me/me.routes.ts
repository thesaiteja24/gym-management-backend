import { Router } from 'express'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	addMeasurements,
	deleteMyProfilePic,
	getFitnessProfile,
	getMe,
	getMeasurements,
	getNutritionPlan,
	getStrengthTrend,
	getTrainingAnalytics,
	getUserAnalytics,
	updateFitnessProfile,
	updateMe,
	updateMyProfilePic,
	updateNutritionPlan,
} from './me.controller.js'
import {
	addDailyMeasurementSchema,
	getMeasurementsSchema,
	getStrengthTrendSchema,
	getTrainingAnalyticsSchema,
	updateFitnessProfileSchema,
	updateMeSchema,
	updateNutritionPlanSchema,
} from './me.validators.js'

const router = Router()

// Profile
router
	.route('/')
	.get(getMe)
	.patch(validateResource(updateMeSchema), updateMe)

router
	.route('/profile-picture')
	.patch(upload.single('profilePic'), updateMyProfilePic)
	.delete(deleteMyProfilePic)

// Fitness Profile
router
	.route('/fitness-profile')
	.put(validateResource(updateFitnessProfileSchema), updateFitnessProfile)
	.get(getFitnessProfile)

// Measurements
router
	.route('/measurements')
	.post(
		upload.array('progressPics', 10),
		validateResource(addDailyMeasurementSchema),
		addMeasurements
	)
	.get(validateResource(getMeasurementsSchema), getMeasurements)

// Nutrition Plan
router
	.route('/nutrition-plan')
	.get(getNutritionPlan)
	.put(validateResource(updateNutritionPlanSchema), updateNutritionPlan)

// Analytics
router.route('/analytics').get(getUserAnalytics)

router
	.route('/analytics/training')
	.get(validateResource(getTrainingAnalyticsSchema), getTrainingAnalytics)

router
	.route('/analytics/strength-trend')
	.get(validateResource(getStrengthTrendSchema), getStrengthTrend)

export const meRoutes = router
