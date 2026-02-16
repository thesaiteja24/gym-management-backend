import { Request, Response } from 'express'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'

export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
	return res.status(200).json(new ApiResponse(200, null, 'Health check passed'))
})
