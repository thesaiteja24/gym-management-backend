import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prismaClientSingleton = (url?: string) => {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined).$extends(
    withAccelerate(),
  )
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
  var readPrisma: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prisma ?? prismaClientSingleton(process.env.DATABASE_URL)

export const readPrisma =
  globalThis.readPrisma ??
  (process.env.REPLICA_URL
    ? prismaClientSingleton(process.env.REPLICA_URL)
    : prisma)

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
  globalThis.readPrisma = readPrisma
}
