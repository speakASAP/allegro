# Multi-stage build for Allegro Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package and build it first
COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm ci && npm run build

# Copy service files
WORKDIR /app
COPY services/allegro-service/package*.json ./services/allegro-service/
COPY services/allegro-service/tsconfig.json ./services/allegro-service/
COPY services/allegro-service/src ./services/allegro-service/src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY package*.json ./

# Install dependencies, generate Prisma client, and build
WORKDIR /app/services/allegro-service
RUN npm ci
WORKDIR /app
RUN npx prisma@5.7.1 generate
WORKDIR /app/services/allegro-service
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy entire shared package (needed for file: reference to work)
COPY --from=builder /app/shared ./shared

# Copy built service
COPY --from=builder /app/services/allegro-service/dist ./dist
COPY --from=builder /app/services/allegro-service/package*.json ./
COPY --from=builder /app/services/allegro-service/node_modules ./node_modules

# Copy root package.json for shared dependencies
COPY --from=builder /app/package*.json ./

EXPOSE 3403

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3403/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]

