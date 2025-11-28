# Build stage
FROM node:lts-slim AS builder

WORKDIR /app

# Copy package files
COPY services/allegro-frontend-service/package.json ./
COPY services/allegro-frontend-service/package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY services/allegro-frontend-service ./

# Build the application
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
