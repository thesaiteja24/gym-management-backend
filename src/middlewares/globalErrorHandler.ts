import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express'

import { ApiError } from '../utils/ApiError.js'
import { logger } from '../utils/logger.js'

interface RequestWithSession extends Request {
  session?: {
    inTransaction: () => boolean
    abortTransaction: () => Promise<void>
    endSession: () => Promise<void>
  }
}

export const globalErrorHandler: ErrorRequestHandler = async (
  err: Error,
  req: RequestWithSession,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  // Check for active transaction session and abort if present
  if (req.session && req.session.inTransaction()) {
    try {
      await req.session.abortTransaction()
    } catch (_abortError) {
      // Silent abort failure
    } finally {
      await req.session.endSession()
    }
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, url: req.originalUrl, method: req.method }, err.message)
    } else {
      logger.warn({ err, url: req.originalUrl, method: req.method }, err.message)
    }
    res.status(err.statusCode).json({
      success: err.success,
      message: err.message,
      errors: err.errors,
      data: err.data,
    })
  } else {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'Internal server error')
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: [err.message],
      data: null,
    })
  }
}
