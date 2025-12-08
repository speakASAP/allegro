# Allegro Deployment Plan

## Overview

Create Dockerfiles and docker-compose files for blue/green deployment of the Allegro application with 5 services:
1. API Gateway (NestJS, port 3411)
2. Allegro Service (NestJS, port 3403)
3. Import Service (NestJS, port 3406)
4. Settings Service (NestJS, port 3408)
5. Frontend Service (React/Vite, port 3410, served via nginx)

## Implementation Checklist

### 1. Create Dockerfiles

1.1. Create `Dockerfile` for API Gateway service
- Base: Node.js 20-alpine
- Build shared package first
- Copy service files
- Install dependencies
- Build TypeScript
- Expose port 3411
- Health check on /health

1.2. Create `services/api-gateway/Dockerfile`
- Multi-stage build
- Build stage: Install dependencies, build shared, build service
- Production stage: Copy built files, install production deps only

1.3. Create `services/allegro-service/Dockerfile`
- Same structure as API Gateway
- Expose port 3403

1.4. Create `services/import-service/Dockerfile`
- Same structure as API Gateway
- Expose port 3406

1.5. Create `services/allegro-settings-service/Dockerfile`
- Same structure as API Gateway
- Expose port 3408

1.6. Create `services/allegro-frontend-service/Dockerfile`
- Multi-stage build
- Build stage: Install dependencies, build React app with Vite
- Production stage: Use nginx:alpine, copy built dist and nginx.conf
- Expose port 3410

### 2. Create Docker Compose Files

2.1. Create `docker-compose.blue.yml`
- Define all 5 services with -blue suffix
- Use nginx-network (external)
- Set container names with -blue suffix
- Map environment variables from .env
- Configure health checks
- Set restart policy

2.2. Create `docker-compose.green.yml`
- Same as blue but with -green suffix
- Use same ports (container ports, not host ports)

### 3. Create Service Registry

3.1. Create service registry JSON file for nginx-microservice
- Path: `/home/statex/nginx-microservice/service-registry/allegro.json` (on production)
- Define frontend and backend services
- Set container names, ports, health endpoints
- Set production path: `/home/statex/allegro`
- Set domain: `allegro.statex.cz`
- Configure docker-compose file names

### 4. Environment Configuration

4.1. Create `.env.example` file
- Document all required environment variables
- Include database, auth, logging, notification service URLs
- Include all service ports
- Include Allegro API configuration
- No secret values

### 5. Documentation

5.1. Update README.md with deployment instructions
- Add Docker deployment section
- Add blue/green deployment instructions
- Reference nginx-microservice deployment

## File Structure

```
allegro/
├── Dockerfile (root - for shared package build if needed)
├── docker-compose.blue.yml
├── docker-compose.green.yml
├── .env.example
├── services/
│   ├── api-gateway/
│   │   └── Dockerfile
│   ├── allegro-service/
│   │   └── Dockerfile
│   ├── import-service/
│   │   └── Dockerfile
│   ├── allegro-settings-service/
│   │   └── Dockerfile
│   └── allegro-frontend-service/
│       └── Dockerfile
└── DEPLOYMENT_PLAN.md (this file)
```

## Service Ports (Container Ports)

- API Gateway: 3411
- Allegro Service: 3403
- Import Service: 3406
- Settings Service: 3408
- Frontend Service: 3410

## Container Naming Convention

- Blue: `{service-name}-blue` (e.g., `allegro-api-gateway-blue`)
- Green: `{service-name}-green` (e.g., `allegro-api-gateway-green`)

## Network

All services must be on `nginx-network` (external network).

## Health Endpoints

- API Gateway: `/health`
- Allegro Service: `/health`
- Import Service: `/health`
- Settings Service: `/health`
- Frontend Service: `/health` (via nginx)

