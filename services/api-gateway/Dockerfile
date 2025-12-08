# Multi-stage build for API Gateway
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package and build it first
COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm ci && npm run build

# Copy service files
WORKDIR /app
COPY services/api-gateway/package*.json ./services/api-gateway/
COPY services/api-gateway/tsconfig.json ./services/api-gateway/
COPY services/api-gateway/src ./services/api-gateway/src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY package*.json ./

# Install dependencies, generate Prisma client, and build
WORKDIR /app/services/api-gateway
RUN npm ci
WORKDIR /app
RUN npx prisma@5.7.1 generate
WORKDIR /app/services/api-gateway
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy entire shared package (needed for file: reference to work)
COPY --from=builder /app/shared ./shared

# Copy built service
COPY --from=builder /app/services/api-gateway/dist ./dist
COPY --from=builder /app/services/api-gateway/package*.json ./
COPY --from=builder /app/services/api-gateway/node_modules ./node_modules

# Copy root package.json for shared dependencies
COPY --from=builder /app/package*.json ./

EXPOSE 3411

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3411/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]

