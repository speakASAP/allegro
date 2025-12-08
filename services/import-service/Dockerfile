# Multi-stage build for Import Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package and build it first
COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm ci && npm run build

# Copy service files
WORKDIR /app
COPY services/import-service/package*.json ./services/import-service/
COPY services/import-service/tsconfig.json ./services/import-service/
COPY services/import-service/src ./services/import-service/src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY package*.json ./

# Install dependencies, generate Prisma client, and build
WORKDIR /app/services/import-service
RUN npm ci
WORKDIR /app
RUN npx prisma generate
WORKDIR /app/services/import-service
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built shared package
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package*.json ./shared/
COPY --from=builder /app/shared/node_modules ./shared/node_modules

# Copy built service
COPY --from=builder /app/services/import-service/dist ./dist
COPY --from=builder /app/services/import-service/package*.json ./
COPY --from=builder /app/services/import-service/node_modules ./node_modules

# Copy root package.json for shared dependencies
COPY --from=builder /app/package*.json ./

EXPOSE 3406

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3406/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]

