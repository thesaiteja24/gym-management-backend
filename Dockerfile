# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy the rest of the source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the TypeScript app
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Copy built assets and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/docs ./docs

# Environment variables
ENV NODE_ENV=production

# Run migrations and start the app
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
