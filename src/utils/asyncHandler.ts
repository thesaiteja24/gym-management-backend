import type { Request, Response, NextFunction, RequestHandler } from 'express'

export const asyncHandler = (
  requestHandler: (
    req: Request<any, any, any>,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(requestHandler(req, res, next)).catch((err: Error) => next(err))
  }
}
