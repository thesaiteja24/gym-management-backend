# Build stage
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile

# Generate Prisma Client
RUN bunx prisma generate

COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# Copy generated client and build artifacts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Run migrations and start the fastify server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run dist/src/server.js"]
