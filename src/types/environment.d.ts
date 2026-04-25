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
      CORS_ORIGIN: string
      AWS_ACCESS_KEY_ID?: string
      AWS_SECRET_ACCESS_KEY?: string
      AWS_REGION?: string
      AWS_S3_BUCKET?: string
      GOOGLE_WEB_CLIENT_ID?: string
      GOOGLE_ANDROID_CLIENT_ID?: string
      GOOGLE_IOS_CLIENT_ID?: string
    }
  }
}

export {}
