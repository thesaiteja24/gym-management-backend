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

RUN apk add --no-cache wget

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# Copy generated client and build artifacts
COPY --from=builder --chown=bun:bun /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=bun:bun /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=builder --chown=bun:bun /app/prisma ./prisma
COPY --from=builder --chown=bun:bun /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=bun:bun /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD sh -c 'wget -q --spider "http://127.0.0.1:${PORT:-3000}/api/v1/health" || exit 1'

USER bun

# Database migrations run as an explicit deployment job.
CMD ["bun", "run", "dist/src/server.js"]
