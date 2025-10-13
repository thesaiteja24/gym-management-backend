import { ApiError } from '../utils/ApiError.js'

export const globalErrorHandler = async (err, req, res, next) => {
	// Check for active transaction session and abort if present
	if (req.session && req.session.inTransaction()) {
		try {
			await req.session.abortTransaction()
			console.error('Transaction aborted')
		} catch (abortError) {
			console.error('Failed to abort transaction:', abortError.stack)
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
