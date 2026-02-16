declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: 'dev' | 'production' | 'test'
			PORT?: string
			DATABASE_URL: string
			REDIS_URL: string
			REDIS_TLS?: string
			ACCESS_TOKEN_SECRET: string
			ACCESS_TOKEN_EXPIRY: string
			REFRESH_TOKEN_SECRET: string
			REFRESH_TOKEN_EXPIRY: string
			BCRYPT_SALT_ROUNDS: string
			OTP_TTL: string
			CORS_ORIGIN: string
			AWS_ACCESS_KEY_ID?: string
			AWS_SECRET_ACCESS_KEY?: string
			AWS_REGION?: string
			AWS_S3_BUCKET?: string
			TWILIO_ACCOUNT_SID?: string
			TWILIO_AUTH_TOKEN?: string
			TWILIO_PHONE_NUMBER?: string
		}
	}
}

export {}
