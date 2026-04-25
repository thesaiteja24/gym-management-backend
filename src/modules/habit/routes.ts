import { Router } from 'express'

import { authorizeSelfOrAdmin } from '../../middlewares/authorize.middleware.js'
import { validateResource } from '../../middlewares/validate.middleware.js'
import {
  createHabit,
  deleteHabit,
  getHabitLogs,
  getHabits,
  logHabit,
  updateHabit,
} from './controller.js'
import {
  createHabitSchema,
  getHabitLogsSchema,
  logHabitSchema,
  updateHabitSchema,
} from './validators.js'

const router = Router()

// HABITS CRUD

router
  .route('/:userId')
  .get(authorizeSelfOrAdmin('userId'), getHabits)
  .post(
    authorizeSelfOrAdmin('userId'),
    validateResource(createHabitSchema),
    createHabit,
  )

router
  .route('/:userId/:id')
  .put(
    authorizeSelfOrAdmin('userId'),
    validateResource(updateHabitSchema),
    updateHabit,
  )
  .delete(authorizeSelfOrAdmin('userId'), deleteHabit)

// LOGGING

router
  .route('/:userId/:id/log')
  .post(
    authorizeSelfOrAdmin('userId'),
    validateResource(logHabitSchema),
    logHabit,
  )

router
  .route('/:userId/logs')
  .get(
    authorizeSelfOrAdmin('userId'),
    validateResource(getHabitLogsSchema),
    getHabitLogs,
  )

export const habitRoutes = router
