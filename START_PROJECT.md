# How to Start the Allegro Integration Project

## Option 1: Using Docker Compose (Recommended for Production)

### Prerequisites

1. **Start Docker Desktop** - Make sure Docker Desktop is running
2. **Database Connection** - Ensure database server is accessible (configured in .env)

### Steps

1. **Start Docker Desktop** (if not running):

   ```bash
   # On macOS, open Docker Desktop application
   open -a Docker
   ```

2. **Build and start all services**:

   ```bash
   docker compose up -d --build
   ```

3. **Check service status**:

   ```bash
   docker compose ps
   ```

4. **View logs**:

   ```bash
   # All services
   docker compose logs -f
   
   # Specific service
   docker compose logs -f api-gateway
   ```

5. **Access services**:
   - API Gateway: <http://localhost:3411>
   - Health Check: <http://localhost:3411/health>
   - Product Service: <http://localhost:3402/health>
   - Allegro Service: <http://localhost:3403/health>

6. **Stop services**:

   ```bash
   docker compose down
   ```

## Option 2: Development Mode (Run Services Directly)

### Prerequisites

- Node.js 20+ installed
- All dependencies installed (`npm install` in root and each service)
- Database accessible

### Steps

1. **Build shared module first**:

   ```bash
   cd shared
   npm run build
   cd ..
   ```

2. **Start services in separate terminals**:

   **Terminal 1 - API Gateway**:

   ```bash
   cd services/api-gateway
   npm run start:dev
   ```

   **Terminal 2 - Product Service**:

   ```bash
   cd services/product-service
   npm run start:dev
   ```

   **Terminal 3 - Allegro Service**:

   ```bash
   cd services/allegro-service
   npm run start:dev
   ```

   **Terminal 4 - Sync Service**:

   ```bash
   cd services/sync-service
   npm run start:dev
   ```

   **Terminal 5 - Webhook Service**:

   ```bash
   cd services/webhook-service
   npm run start:dev
   ```

   **Terminal 6 - Import Service**:

   ```bash
   cd services/import-service
   npm run start:dev
   ```

   **Terminal 7 - Scheduler Service**:

   ```bash
   cd services/scheduler-service
   npm run start:dev
   ```

3. **Or use a process manager** (like PM2 or concurrently):

   ```bash
   # Install concurrently globally
   npm install -g concurrently
   
   # Create start script (see package.json)
   ```

## Quick Start Script

You can also create a start script. Check if there's a start script in root package.json.

## Troubleshooting

1. **Docker not running**: Start Docker Desktop
2. **Port already in use**: Check what's using the port: `lsof -i :3411`
3. **Database connection error**: Check .env file DB_* variables
4. **Service dependencies**: Make sure shared module is built first
5. **Environment variables**: Ensure .env file has all required variables

## Service Ports

- API Gateway: 3411
- Product Service: 3402
- Allegro Service: 3403
- Sync Service: 3404
- Webhook Service: 3405
- Import Service: 3406
- Scheduler Service: 3407

## Health Checks

All services expose `/health` endpoint:

- <http://localhost:3411/health> (API Gateway)
- <http://localhost:3402/health> (Product Service)
- etc.
