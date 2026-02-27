import { Request, Response } from 'express'
import { ApiResponse } from '../../common/utils/ApiResponse.js'
import { asyncHandler } from '../../common/utils/asyncHandler.js'

export const getGoogleClientId = asyncHandler(async (req: Request, res: Response) => {
	const clientId = process.env.GOOGLE_WEB_CLIENT_ID
	return res.status(200).json(new ApiResponse(200, { clientId }, 'Google Client ID fetched successfully'))
})
