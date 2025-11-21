FROM node:lts-slim

# Install OpenSSL for Prisma and curl for health checks
RUN apt-get update -y && apt-get install -y openssl libssl-dev curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package-lock.json* ./shared/
COPY services/product-service/package.json ./services/product-service/

# Install dependencies
RUN npm install

# Copy source code
COPY shared ./shared
COPY services/product-service ./services/product-service
COPY prisma ./prisma
COPY tsconfig.json ./

# Install shared module dependencies first
WORKDIR /app/shared
RUN npm install --legacy-peer-deps

# Generate Prisma Client
WORKDIR /app
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build shared module
RUN npm run build

# Build service
WORKDIR /app/services/product-service
RUN npm install --include=dev
RUN npm run build
# Copy compiled shared module to service dist
RUN cp -r ../../shared/dist ./dist/shared || true

# Expose port
EXPOSE 3402

# Set NODE_PATH to include shared node_modules for runtime module resolution
ENV NODE_PATH=/app/shared/node_modules:/app/node_modules

# Start service
CMD ["node", "dist/main.js"]

