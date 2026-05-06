import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ParamsDictionary, Query } from 'express-serve-static-core'

export const asyncHandler = <
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Query,
>(
  requestHandler: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction): void => {
    Promise.resolve(requestHandler(req, res, next)).catch((err: Error) => next(err))
  }
}
