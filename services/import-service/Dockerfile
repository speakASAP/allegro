# Multi-stage build for Import Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package and install dependencies first
COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm ci
# Copy prisma schema and generate Prisma client into shared/node_modules/.prisma/client
WORKDIR /app
COPY prisma ./shared/prisma
WORKDIR /app/shared/prisma
RUN npx prisma@5.7.1 generate
WORKDIR /app/shared
RUN npm run build

# Copy service files
WORKDIR /app
COPY services/import-service/package*.json ./services/import-service/
COPY services/import-service/tsconfig.json ./services/import-service/
COPY services/import-service/src ./services/import-service/src
COPY tsconfig.json ./
COPY package*.json ./

# Install dependencies and build
WORKDIR /app/services/import-service
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy entire shared package (needed for file: reference to work, includes generated Prisma client)
COPY --from=builder /app/shared ./shared

# Copy service files maintaining directory structure for file: references
COPY --from=builder /app/services/import-service ./services/import-service

# Copy root package.json for shared dependencies
COPY --from=builder /app/package*.json ./

WORKDIR /app/services/import-service

EXPOSE 3406

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3406/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]

