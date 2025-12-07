# Build stage
FROM node:lts-slim AS builder

WORKDIR /app

# Copy package files
COPY services/allegro-frontend-service/package.json ./
COPY services/allegro-frontend-service/package-lock.json* ./

# Install dependencies with retry logic and BuildKit cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || \
    (sleep 10 && npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000) || \
    (sleep 20 && npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000)

# Copy source code
COPY services/allegro-frontend-service ./

# Build the application with API URL from environment variable
# VITE_API_URL should be set in docker-compose.yml or .env file
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY services/allegro-frontend-service/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3410

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

