import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import fp from 'fastify-plugin'
import pg from 'pg'

export const prismaPlugin = fp(async (app) => {
  const url = app.config.MASTER_URL

  if (!url) {
    throw new Error('MASTER_URL environment variable is not set')
  }

  // Prisma 7 recommends using driver adapters for direct database connections
  const pool = new pg.Pool({ connectionString: url })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    await prisma.$connect()
    app.log.info('Database connection established successfully')
  }
  catch (error) {
    app.log.error({ error }, 'Failed to connect to the database')
    throw error
  }

  // Decorate the fastify instance with our prisma client
  app.decorate('prisma', prisma)

  // Ensure connections are closed when the server stops
  app.addHook('onClose', async (instance) => {
    app.log.info('Disconnecting from database...')
    await instance.prisma.$disconnect()
    await pool.end()
  })
})
