import { Router } from 'express'

import { upload } from '../../middlewares/upload.middleware.js'
import { validateResource } from '../../middlewares/validate.middleware.js'

import {
  addMeasurements,
  deleteMyProfilePic,
  getFitnessProfile,
  getMe,
  getMeasurements,
  getNutritionPlan,
  getUserAnalytics,
  updateFitnessProfile,
  updateMe,
  updateMyProfilePic,
  updateNutritionPlan,
} from './me.controllers.js'
import {
  addDailyMeasurementSchema,
  getMeasurementsSchema,
  getTrainingAnalyticsSchema,
  updateFitnessProfileSchema,
  updateMeSchema,
  updateNutritionPlanSchema,
} from './me.validators.js'

const router = Router()

// Profile
router.route('/').get(getMe).patch(validateResource(updateMeSchema), updateMe)

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
  .put(
    upload.array('progressPics', 10),
    validateResource(addDailyMeasurementSchema),
    addMeasurements,
  )
  .get(validateResource(getMeasurementsSchema), getMeasurements)

// Nutrition Plan
router
  .route('/nutrition-plan')
  .get(getNutritionPlan)
  .put(validateResource(updateNutritionPlanSchema), updateNutritionPlan)

// Analytics
router.route('/analytics').get(getUserAnalytics)



export const meRoutes = router
