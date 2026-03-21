import { Router } from 'express'
import { authorizeSelfOrAdmin } from '../../common/middlewares/authorize.middleware.js'
import { validateResource } from '../../common/middlewares/validate.middleware.js'
import {
	createHabit,
	deleteHabit,
	getHabitLogs,
	getHabits,
	logHabit,
	updateHabit,
} from './habit.controller.js'
import {
	createHabitSchema,
	getHabitLogsSchema,
	logHabitSchema,
	updateHabitSchema,
} from './habit.validators.js'

const router = Router()

// Habits CRUD
router
	.route('/:userId')
	.get(authorizeSelfOrAdmin('userId'), getHabits)
	.post(validateResource(createHabitSchema), authorizeSelfOrAdmin('userId'), createHabit)

router
	.route('/:userId/:id')
	.put(validateResource(updateHabitSchema), authorizeSelfOrAdmin('userId'), updateHabit)
	.delete(authorizeSelfOrAdmin('userId'), deleteHabit)

// Logging
router
	.route('/:userId/:id/log')
	.post(validateResource(logHabitSchema), authorizeSelfOrAdmin('userId'), logHabit)

router
	.route('/:userId/logs')
	.get(validateResource(getHabitLogsSchema), authorizeSelfOrAdmin('userId'), getHabitLogs)

export const habitRoutes = router
