import { Router } from 'express'
import { deleteProfilePic, getUser, updateProfilePic, updateUser } from '../controllers/user.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'
import { authorizeSelfOrAdmin } from '../middlewares/authorize.middleware.js'

const router = Router()

router.route('/:id').get(getUser)
router.route('/:id').patch(authorizeSelfOrAdmin(), updateUser)
router.route('/:id/profile-picture').patch(authorizeSelfOrAdmin(), upload.single('profilePic'), updateProfilePic)
router.route('/:id/profile-picture').delete(authorizeSelfOrAdmin(), deleteProfilePic)

export const userRoutes = router
