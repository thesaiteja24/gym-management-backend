import { NextFunction, Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { ApiError } from '../utils/ApiError.js'
import { logWarn } from '../utils/logger.js'

export const validateResource =
	(schema: z.ZodObject<any, any>) => (req: Request, res: Response, next: NextFunction) => {
		try {
			schema.parse({
				body: req.body,
				query: req.query,
				params: req.params,
			})
			next()
		} catch (e: any) {
			if (e instanceof ZodError) {
				const errorMessages = e.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`)
				logWarn('Validation failed', { action: 'validateResource', errors: errorMessages }, req)
				next(new ApiError(400, 'Validation failed', errorMessages))
			} else {
				next(e)
			}
		}
	}
