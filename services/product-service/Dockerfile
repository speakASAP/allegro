# Builder stage - dev deps only for building, not in final image
FROM node:lts-slim AS builder

# Install build dependencies
RUN apt-get update -y && apt-get install -y openssl libssl-dev curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for better caching
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package-lock.json* ./shared/
COPY services/product-service/package.json ./services/product-service/

# Install all dependencies (including dev) in builder only
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || \
    (sleep 10 && npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000) || \
    (sleep 20 && npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000)

# Install shared dependencies
WORKDIR /app/shared
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || \
    (sleep 10 && npm ci --legacy-peer-deps --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000) || \
    (sleep 20 && npm ci --legacy-peer-deps --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000)

# Copy source code
WORKDIR /app
COPY shared ./shared
COPY services/product-service ./services/product-service
COPY prisma ./prisma
COPY tsconfig.json ./

# Generate Prisma client once in root node_modules
RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# Build shared module
WORKDIR /app/shared
RUN npm run build

# Install service dev dependencies and build
WORKDIR /app/services/product-service
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || \
    npm install --include=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
RUN npm run build
RUN cp -r ../../shared/dist ./dist/shared || true

# Production stage - NO dev dependencies
FROM node:lts-slim

# Install runtime dependencies only
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package-lock.json* ./shared/
COPY services/product-service/package.json ./services/product-service/

# Install production dependencies only
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || \
    (sleep 10 && npm ci --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000) || \
    (sleep 20 && npm ci --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000)

# Install shared production dependencies
WORKDIR /app/shared
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --legacy-peer-deps --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || \
    (sleep 10 && npm ci --omit=dev --legacy-peer-deps --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000) || \
    (sleep 20 && npm ci --omit=dev --legacy-peer-deps --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000)

# Copy Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled code from builder (NO source code, NO dev deps)
COPY --from=builder /app/services/product-service/dist ./dist
COPY --from=builder /app/shared/dist ./shared/dist

# Set NODE_PATH for module resolution
ENV NODE_PATH=/app/shared/node_modules:/app/node_modules

# Expose port
EXPOSE 3402

# Start service
CMD ["node", "dist/main.js"]
