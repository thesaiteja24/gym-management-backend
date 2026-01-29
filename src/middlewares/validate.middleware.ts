import { NextFunction, Request, Response } from 'express'
import { z, ZodObject, ZodError } from 'zod'
import { ApiError } from '../utils/ApiError.js'
import { logWarn } from '../utils/logger.js'

// Generic types for typed middleware
export const validateResource =
	<T extends ZodObject<any, any>>(schema: T) =>
	(req: Request<any, any, any>, res: Response, next: NextFunction) => {
		try {
			// Parse and transform
			const parsed = schema.parse({
				body: req.body,
				query: req.query,
				params: req.params,
			})

			// Assign parsed values back to request safely
			if (parsed.body) req.body = parsed.body
			if (parsed.query) req.query = parsed.query as any
			if (parsed.params) req.params = parsed.params

			next()
		} catch (e: unknown) {
			if (e instanceof ZodError) {
				const errorMessages = e.issues.map(iss => iss.path.join('.') + ': ' + iss.message)
				logWarn('Validation failed', { action: 'validateResource', errors: errorMessages }, req)
				next(new ApiError(400, 'Validation failed', errorMessages))
			} else {
				next(e)
			}
		}
	}

// Helper type to extract validated type from a Zod schema
export type ValidatedRequest<T extends ZodObject<any, any>> = Request<
	z.infer<T>['params'],
	any,
	z.infer<T>['body'],
	z.infer<T>['query']
>
