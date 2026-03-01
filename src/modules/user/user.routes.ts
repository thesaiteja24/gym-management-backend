import { Router } from 'express'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { upload } from '../../common/middlewares/upload.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	addDailyMeasurement,
	deleteProfilePic,
	getMeasurementHistory,
	getUser,
	getUserFitnessProfile,
	updateProfilePic,
	updateUser,
	updateUserFitnessProfile,
} from './user.controller.js'
import {
	addDailyMeasurementSchema,
	updateFitnessProfileSchema,
	updateProfilePicSchema,
	updateUserSchema,
} from './user.validators.js'

const router = Router()

// single user
router.route('/:id').get(getUser).patch(validateResource(updateUserSchema), authorizeSelfOrAdmin(), updateUser)

// profile picture
router
	.route('/:id/profile-picture')
	.patch(
		upload.single('profilePic'),
		validateResource(updateProfilePicSchema),
		authorizeSelfOrAdmin(),
		updateProfilePic
	)
	.delete(validateResource(updateProfilePicSchema), authorizeSelfOrAdmin(), deleteProfilePic)

// fitness profile
router
	.route('/:id/fitness-profile')
	.patch(validateResource(updateFitnessProfileSchema), authorizeSelfOrAdmin(), updateUserFitnessProfile)
	.get(authorizeSelfOrAdmin(), getUserFitnessProfile)

// user measurements
router
	.route('/:id/measurements')
	.post(
		upload.array('progressPics', 10),
		validateResource(addDailyMeasurementSchema),
		authorizeSelfOrAdmin(),
		addDailyMeasurement
	)
	.get(authorizeSelfOrAdmin(), getMeasurementHistory)

export const userRoutes = router
