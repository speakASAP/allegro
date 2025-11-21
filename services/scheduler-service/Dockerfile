FROM node:lts-slim

# Install OpenSSL for Prisma and curl for health checks
RUN apt-get update -y && apt-get install -y openssl libssl-dev curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package-lock.json* ./shared/
COPY services/scheduler-service/package.json ./services/scheduler-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared ./shared
COPY services/scheduler-service ./services/scheduler-service
COPY prisma ./prisma
COPY tsconfig.json ./

# Install shared module dependencies first
WORKDIR /app/shared
RUN npm install --legacy-peer-deps

# Generate Prisma Client in shared module's node_modules
# Prisma generates client where @prisma/client is installed (shared/node_modules)
# We need to run from shared directory so Prisma finds @prisma/client there
WORKDIR /app/shared
RUN npx prisma generate --schema=../prisma/schema.prisma
# Verify Prisma client was generated
RUN test -d node_modules/.prisma && echo "Prisma client generated successfully" || (echo "ERROR: Prisma client not found" && ls -la node_modules/ && exit 1)

# Build shared module
WORKDIR /app/shared
RUN npm run build

# Build service
WORKDIR /app/services/scheduler-service
RUN npm install --include=dev
RUN npm run build
# Copy compiled shared module to service dist
RUN cp -r ../../shared/dist ./dist/shared || true

# Expose port
EXPOSE 3407

# Set NODE_PATH to include shared node_modules for runtime module resolution
ENV NODE_PATH=/app/shared/node_modules:/app/node_modules

# Start service
CMD ["node", "dist/main.js"]

