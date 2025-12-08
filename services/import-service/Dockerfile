# Production stage - assumes code is pre-built outside Docker
FROM node:lts-slim

# Install runtime dependencies only
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package-lock.json* ./shared/
COPY services/import-service/package.json ./services/import-service/

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

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma || \
    ../../node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# Copy compiled code (assumes built outside Docker)
COPY services/import-service/dist ./dist
COPY shared/dist ./shared/dist

# Set NODE_PATH for module resolution
ENV NODE_PATH=/app/shared/node_modules:/app/node_modules

# Expose port
EXPOSE 3406

# Start service
CMD ["node", "dist/main.js"]
