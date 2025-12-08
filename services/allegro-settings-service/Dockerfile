# Multi-stage build for Settings Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package and install dependencies first
COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm ci
# Copy prisma schema to original location and generate Prisma client
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma@5.7.1 generate --schema=./prisma/schema.prisma
# Fix: Copy index.js to default.js so @prisma/client can find the real client (not the stub)
RUN cp /app/shared/node_modules/.prisma/client/index.js /app/shared/node_modules/.prisma/client/default.js || true
WORKDIR /app/shared
RUN npm run build

# Copy service files
WORKDIR /app
COPY services/allegro-settings-service/package*.json ./services/allegro-settings-service/
COPY services/allegro-settings-service/tsconfig.json ./services/allegro-settings-service/
COPY services/allegro-settings-service/src ./services/allegro-settings-service/src
COPY tsconfig.json ./
COPY package*.json ./

# Install dependencies and build
WORKDIR /app/services/allegro-settings-service
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine

# Install OpenSSL for Prisma query engine
RUN apk add --no-cache openssl1.1-compat || apk add --no-cache openssl

WORKDIR /app

# Copy entire shared package (needed for file: reference to work, includes generated Prisma client)
COPY --from=builder /app/shared ./shared

# Copy service files maintaining directory structure for file: references
COPY --from=builder /app/services/allegro-settings-service ./services/allegro-settings-service

# Copy root package.json for shared dependencies
COPY --from=builder /app/package*.json ./

WORKDIR /app/services/allegro-settings-service

EXPOSE 3408

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3408/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]

