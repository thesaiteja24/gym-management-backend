import { z } from 'zod'

export const sendOTPSchema = z.object({
	body: z.object({
		countryCode: z.string().min(1, 'Country code is required'),
		phone: z.string().min(1, 'Phone number is required'),
		resend: z.boolean().optional(),
	}),
})

export const verifyOTPSchema = z.object({
	body: z.object({
		countryCode: z.string().min(1, 'Country code is required'),
		phone: z.string().min(1, 'Phone number is required'),
		otp: z.string().min(1, 'OTP is required'),
	}),
})

export const refreshTokenSchema = z.object({
	body: z.object({
		userId: z.uuid({ message: 'Invalid User ID format' }),
	}),
})
