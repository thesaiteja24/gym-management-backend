export class ApiError extends Error {
	statusCode: number
	data: null
	success: false
	errors: string[]

	constructor(
		statusCode: number,
		message: string = 'Something went wrong',
		errors: string[] = [],
		stack: string = ''
	) {
		super(message)
		this.statusCode = statusCode
		this.data = null
		this.message = message
		this.success = false
		this.errors = errors

		if (stack) {
			this.stack = stack
		} else {
			Error.captureStackTrace(this, this.constructor)
		}
	}
}
