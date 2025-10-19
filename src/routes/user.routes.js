import { Router } from 'express'
import { deleteProfilePic, getUser, updateProfilePic, updateUser } from '../controllers/user.controllers.js'
import { upload } from '../middlewares/upload.middleware.js'

const router = Router()

router.route('/:id').get(getUser)
router.route('/:id').patch(updateUser)
router.route('/:id/profile-picture').patch(upload.single('profilePic'), updateProfilePic)
router.route('/:id/profile-picture').delete(deleteProfilePic)

export const userRoutes = router
