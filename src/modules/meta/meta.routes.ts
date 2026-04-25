import { Router } from 'express'

import { ROLES as roles } from '../../constants/roles.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { authorize } from '../../middlewares/authorize.middleware.js'
import { upload } from '../../middlewares/upload.middleware.js'
import { validateResource } from '../../middlewares/validate.middleware.js'

import { deleteMeta, getAllMeta, getMetaById, upsertMeta } from './meta.controller.js'
import { getMetaSchema, metaSchema } from './meta.validators.js'

const router = Router()

router
  .route('/:resource')
  .get(validateResource(getMetaSchema), getAllMeta)
  .post(
    authenticate,
    authorize(roles.systemAdmin),
    upload.single('image'),
    validateResource(metaSchema),
    upsertMeta,
  )

router
  .route('/:resource/:id')
  .get(validateResource(getMetaSchema), getMetaById)
  .put(
    authenticate,
    authorize(roles.systemAdmin),
    upload.single('image'),
    validateResource(metaSchema),
    upsertMeta,
  )
  .delete(authenticate, authorize(roles.systemAdmin), validateResource(getMetaSchema), deleteMeta)

export const metaRoutes = router
