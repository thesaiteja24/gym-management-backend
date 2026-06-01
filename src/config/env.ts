import fp from 'fastify-plugin'

export interface AppConfig {
  NODE_ENV: string
  PORT: number

  MASTER_URL: string
  REPLICA_URL: string
  SHADOW_URL: string

  REDIS_URL: string

  GOOGLE_WEB_CLIENT_ID: string
  GOOGLE_IOS_CLIENT_ID?: string
  GOOGLE_ANDROID_CLIENT_ID?: string

  LOG_LEVEL: string
}

export const envPlugin = fp(async (app) => {
  const schema = {
    type: 'object',

    required: [
      'MASTER_URL',
      'REDIS_URL',
      'GOOGLE_WEB_CLIENT_ID',
    ],

    properties: {
      NODE_ENV: {
        type: 'string',
        default: 'development',
      },

      PORT: {
        type: 'number',
        default: 3000,
      },

      MASTER_URL: {
        type: 'string',
      },

      REPLICA_URL: {
        type: 'string',
      },

      SHADOW_URL: {
        type: 'string',
      },

      REDIS_URL: {
        type: 'string',
      },

      GOOGLE_WEB_CLIENT_ID: {
        type: 'string',
      },

      GOOGLE_IOS_CLIENT_ID: {
        type: 'string',
      },

      GOOGLE_ANDROID_CLIENT_ID: {
        type: 'string',
      },

      LOG_LEVEL: {
        type: 'string',
        default: 'info',
      },
    },
  }

  await app.register(import('@fastify/env'), {
    schema,
    dotenv: true,
  })
})
