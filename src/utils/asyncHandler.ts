import { Request, Response, NextFunction, RequestHandler } from 'express'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asyncHandler = (
	requestHandler: (req: Request<any, any, any>, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
	return (req: Request, res: Response, next: NextFunction): void => {
		Promise.resolve(requestHandler(req, res, next)).catch((err: Error) => next(err))
	}
}
