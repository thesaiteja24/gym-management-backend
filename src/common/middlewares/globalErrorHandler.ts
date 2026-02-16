import { Request, Response, NextFunction, ErrorRequestHandler } from 'express'
import { ApiError } from '../utils/ApiError.js'

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
	_next: NextFunction
): Promise<void> => {
	// Check for active transaction session and abort if present
	if (req.session && req.session.inTransaction()) {
		try {
			await req.session.abortTransaction()
			console.error('Transaction aborted')
		} catch (abortError) {
			console.error('Failed to abort transaction:', (abortError as Error).stack)
		} finally {
			await req.session.endSession()
		}
	}

	if (err instanceof ApiError) {
		res.status(err.statusCode).json({
			success: err.success,
			message: err.message,
			errors: err.errors,
			data: err.data,
		})
	} else {
		console.error('Unhandled error:', err.stack)
		res.status(500).json({
			success: false,
			message: 'Internal server error',
			errors: [err.message],
			data: null,
		})
	}
}
