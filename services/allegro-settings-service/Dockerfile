FROM node:lts-slim

# Install OpenSSL for Prisma and curl for health checks
RUN apt-get update -y && apt-get install -y openssl libssl-dev curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package-lock.json* ./shared/
COPY services/allegro-settings-service/package.json ./services/allegro-settings-service/

# Install root dependencies (includes @prisma/client)
RUN npm install

# Copy source code
COPY shared ./shared
COPY services/allegro-settings-service ./services/allegro-settings-service
COPY prisma ./prisma
COPY tsconfig.json ./

# Generate Prisma Client in root node_modules (where @prisma/client is installed)
# Use prisma CLI directly from node_modules to avoid npx path issues
RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma || node_modules/.bin/prisma generate --schema=./prisma/schema.prisma
# Verify Prisma client was generated in root
RUN test -d node_modules/.prisma && echo "Prisma client generated in root" || (echo "ERROR: Prisma client not found in root" && ls -la node_modules/ | head -20 && exit 1)

# Install shared module dependencies
WORKDIR /app/shared
RUN npm install --legacy-peer-deps

# Generate Prisma Client directly in shared node_modules where @prisma/client is installed
# This ensures Prisma client is properly initialized in the correct location
WORKDIR /app/shared
RUN npx prisma generate --schema=../prisma/schema.prisma || \
    node_modules/.bin/prisma generate --schema=../prisma/schema.prisma || \
    ../../node_modules/.bin/prisma generate --schema=../prisma/schema.prisma
# Verify Prisma client was generated in shared
RUN test -d node_modules/.prisma && echo "Prisma client generated in shared" || (echo "ERROR: Prisma client not found in shared" && ls -la node_modules/ | head -20 && exit 1)

# Build shared module
WORKDIR /app/shared
RUN npm run build

# Build service
WORKDIR /app/services/allegro-settings-service
RUN npm install --include=dev
RUN npm run build
# Copy compiled shared module to service dist
RUN cp -r ../../shared/dist ./dist/shared || true

# Expose port
EXPOSE 3408

# Set NODE_PATH to include shared node_modules for runtime module resolution
ENV NODE_PATH=/app/shared/node_modules:/app/node_modules

# Start service
CMD ["node", "dist/main.js"]
