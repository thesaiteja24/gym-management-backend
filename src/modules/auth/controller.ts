import type { Request, Response } from 'express'

import { ApiResponse } from '../../utils/ApiResponse.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

import * as authService from './service.js'
import type { GoogleLoginBody, RefreshTokenBody } from './types.js'

// FUNCTIONS

export const refreshToken = asyncHandler(
  async (req: Request<object, object, RefreshTokenBody>, res: Response) => {
    const { refreshToken: providedToken } = req.body
    const {
      user,
      accessToken,
      refreshToken: newRefreshToken,
    } = await authService.processRefreshToken(providedToken)

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { user, accessToken, refreshToken: newRefreshToken },
          'Token refreshed successfully',
        ),
      )
  },
)

export const googleLogin = asyncHandler(
  async (req: Request<object, object, GoogleLoginBody>, res: Response) => {
    const { idToken, privacyAccepted, privacyPolicyVersion } = req.body
    const { user, accessToken, refreshToken } = await authService.processGoogleLogin(
      idToken,
      privacyAccepted,
      privacyPolicyVersion,
    )

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { user, accessToken, refreshToken },
          'Google login successful',
        ),
      )
  },
)
