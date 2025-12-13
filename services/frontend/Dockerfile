# Multi-stage build for Frontend Service
FROM node:20-alpine AS builder

WORKDIR /app

# Copy frontend service files
COPY services/frontend/package*.json ./
COPY services/frontend/tsconfig*.json ./
COPY services/frontend/vite.config.ts ./
COPY services/frontend/tailwind.config.js ./
COPY services/frontend/postcss.config.js ./
COPY services/frontend/src ./src
COPY services/frontend/index.html ./
COPY services/frontend/public ./public

# Install dependencies and build
# Set production API URL as build-time environment variable from .env
# FRONTEND_API_URL should be set in .env (e.g., https://allegro.statex.cz/api for prod, http://localhost:3411/api for dev)
ARG FRONTEND_API_URL
ENV VITE_API_URL=${FRONTEND_API_URL}
RUN npm ci && npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built frontend files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY services/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3410

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3410/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

