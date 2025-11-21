# Allegro Integration System

Fully automated NestJS microservices system for managing products on Allegro.cz marketplace.

## Overview

This system provides complete automation for:

- Importing existing Allegro offers into our database
- Importing products from BizBox CSV files, transforming to Allegro format, and publishing
- Bidirectional synchronization between our database and Allegro
- Handling webhook events from Allegro (orders, stock changes)
- Running scheduled sync jobs for periodic updates
- Integrating with external shared microservices (database, logging, auth, notifications)

## Architecture

The system consists of 7 microservices:

1. **API Gateway** (Port 3411) - Request routing and authentication
2. **Product Service** (Port 3402) - Product catalog management
3. **Allegro Service** (Port 3403) - Allegro API integration
4. **Sync Service** (Port 3404) - Bidirectional synchronization
5. **Webhook Service** (Port 3405) - Allegro webhook event handling
6. **Import Service** (Port 3406) - CSV import and transformation
7. **Scheduler Service** (Port 3407) - Scheduled cron jobs

## Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (via shared database-server)
- **ORM**: Prisma
- **Authentication**: External auth-microservice
- **Logging**: External logging-microservice
- **Notifications**: External notifications-microservice
- **Containerization**: Docker & Docker Compose

## Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Access to shared microservices:
  - Database server (db-server-postgres)
  - Auth microservice (<https://auth.statex.cz>)
  - Logging microservice (<https://logging.statex.cz>)
  - Notifications microservice (<https://notifications.statex.cz>)

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your configuration:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` file and set all required variables (see Environment Variables section below)
4. Run database migrations:

   ```bash
   npx prisma migrate dev
   ```

5. Build and start services:

   ```bash
   docker-compose up -d
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Application Configuration

- `NODE_ENV` - Environment (production/development)
- `SERVICE_NAME` - Service name (allegro)

### External Shared Microservices

- `AUTH_SERVICE_URL` - Auth microservice URL (<https://auth.statex.cz> or Docker network URL)
- `NOTIFICATION_SERVICE_URL` - Notifications microservice URL (<https://notifications.statex.cz> or Docker network URL)
- `LOGGING_SERVICE_URL` - Logging microservice URL (<https://logging.statex.cz> or Docker network URL)

### Database Configuration

- `DB_HOST` - Database host (db-server-postgres for Docker)
- `DB_PORT` - Database port (5432)
- `DB_USER` - Database user (dbadmin)
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name (allegro)
- `DATABASE_URL` - Full database connection string (auto-constructed if not provided)

### Service Ports

- `API_GATEWAY_PORT` - API Gateway port (3411)
- `PRODUCT_SERVICE_PORT` - Product Service port (3402)
- `ALLEGRO_SERVICE_PORT` - Allegro Service port (3403)
- `SYNC_SERVICE_PORT` - Sync Service port (3404)
- `WEBHOOK_SERVICE_PORT` - Webhook Service port (3405)
- `IMPORT_SERVICE_PORT` - Import Service port (3406)
- `SCHEDULER_SERVICE_PORT` - Scheduler Service port (3407)

### Allegro API Configuration

- `ALLEGRO_CLIENT_ID` - Allegro API client ID
- `ALLEGRO_CLIENT_SECRET` - Allegro API client secret
- `ALLEGRO_API_URL` - Allegro API URL (<https://api.allegro.pl>)
- `ALLEGRO_API_SANDBOX_URL` - Allegro Sandbox API URL
- `ALLEGRO_USE_SANDBOX` - Use sandbox environment (false)
- `ALLEGRO_WEBHOOK_SECRET` - Webhook secret for verification

### Sync Configuration

- `SYNC_DB_TO_ALLEGRO_INTERVAL` - Cron expression for DB→Allegro sync (`*/15 * * * *`)
- `SYNC_ALLEGRO_TO_DB_INTERVAL` - Cron expression for Allegro→DB sync (`*/30 * * * *`)
- `SYNC_INVENTORY_INTERVAL` - Cron expression for inventory sync (`*/10 * * * *`)
- `SYNC_BATCH_SIZE` - Number of items per batch (100)
- `SYNC_CONFLICT_STRATEGY` - Conflict resolution strategy (TIMESTAMP, DB_WINS, ALLEGRO_WINS, MANUAL)

### Import Configuration

- `IMPORT_CSV_MAX_SIZE` - Maximum CSV file size in bytes (104857600 = 100MB)
- `IMPORT_CSV_BATCH_SIZE` - Rows per batch (50)

### Notification Configuration

- `NOTIFICATION_ORDER_CREATED` - Send notifications on order creation (true)
- `NOTIFICATION_ORDER_UPDATED` - Send notifications on order updates (true)
- `NOTIFICATION_STOCK_LOW` - Send notifications on low stock (true)
- `NOTIFICATION_EMAIL_TO` - Admin email for notifications

### Webhook Configuration

- `WEBHOOK_SECRET` - Secret for webhook verification
- `WEBHOOK_TIMEOUT` - Webhook processing timeout in ms (30000)
- `WEBHOOK_MAX_RETRIES` - Maximum retry attempts (3)

For a complete list of all environment variables, see the `.env.example` file in the root directory or check `docs/IMPLEMENTATION_PLAN.md` section "Environment Configuration".

**Important**: All configuration values must be set in the `.env` file. The application will fail to start if required variables are missing. No hardcoded defaults are used in the codebase.

## API Endpoints

All requests go through API Gateway at `http://localhost:3411/api`

### Product Service Endpoints

- `GET /api/products` - List products (query params: page, limit, search, active)
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/code/:code` - Get product by code
- `POST /api/products` - Create product (auth required)
- `PUT /api/products/:id` - Update product (auth required)
- `DELETE /api/products/:id` - Delete product (auth required)
- `GET /api/products/:id/stock` - Get stock level
- `PUT /api/products/:id/stock` - Update stock level

### Allegro Service Endpoints

- `GET /api/allegro/offers` - List offers (auth required)
- `GET /api/allegro/offers/:id` - Get offer details (auth required)
- `POST /api/allegro/offers` - Create offer (auth required)
- `PUT /api/allegro/offers/:id` - Update offer (auth required)
- `DELETE /api/allegro/offers/:id` - Delete offer (auth required)
- `GET /api/allegro/offers/import` - Import all offers from Allegro (auth required)
- `GET /api/allegro/orders` - List orders (auth required)
- `GET /api/allegro/orders/:id` - Get order details (auth required)
- `GET /api/allegro/categories` - List categories (auth required)
- `GET /api/allegro/categories/:id` - Get category details (auth required)
- `PUT /api/allegro/offers/:id/stock` - Update stock (auth required)

### Import Service Endpoints

- `POST /api/import/csv` - Upload and import CSV file (auth required)
- `GET /api/import/jobs` - List import jobs (auth required)
- `GET /api/import/jobs/:id` - Get import job details (auth required)
- `GET /api/import/jobs/:id/status` - Get import job status (auth required)
- `POST /api/import/jobs/:id/retry` - Retry failed import (auth required)

### Sync Service Endpoints

- `POST /api/sync/db-to-allegro` - Sync database to Allegro (auth required)
- `POST /api/sync/allegro-to-db` - Sync Allegro to database (auth required)
- `POST /api/sync/bidirectional` - Bidirectional sync (auth required)
- `POST /api/sync/product/:id` - Sync specific product (auth required)
- `GET /api/sync/jobs` - List sync jobs (auth required)
- `GET /api/sync/jobs/:id` - Get sync job details (auth required)

### Webhook Service Endpoints

- `POST /api/webhooks/allegro` - Receive Allegro webhook events
- `GET /api/webhooks/events` - List webhook events (auth required)
- `GET /api/webhooks/events/:id` - Get webhook event details (auth required)
- `POST /api/webhooks/events/:id/retry` - Retry processing event (auth required)

## Scheduled Jobs

The Scheduler Service runs the following cron jobs:

- **DB → Allegro sync**: Every 15 minutes
- **Allegro → DB sync**: Every 30 minutes
- **Inventory sync**: Every 10 minutes
- **Cleanup old jobs**: Daily at 2 AM

## Database Schema

The system uses a new `allegro` database on the shared database-server with the following main tables:

- `products` - Products from BizBox/our system
- `allegro_offers` - Allegro offers mapped to products
- `allegro_orders` - Orders from Allegro
- `sync_jobs` - Sync operation logs
- `import_jobs` - CSV import job tracking
- `webhook_events` - Incoming webhook events log
- `supplier_products` - Supplier API integration (placeholder)

## Deployment

### Docker Compose

All services run in Docker containers connected to `nginx-network`. To deploy:

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Health Checks

All services expose `/health` endpoints for monitoring:

- API Gateway: `http://localhost:3411/health`
- Product Service: `http://localhost:3402/health`
- Allegro Service: `http://localhost:3403/health`
- Sync Service: `http://localhost:3404/health`
- Webhook Service: `http://localhost:3405/health`
- Import Service: `http://localhost:3406/health`
- Scheduler Service: `http://localhost:3407/health`

### Blue/Green Deployment

For zero-downtime updates, use blue/green deployment pattern with separate docker-compose files.

### Monitoring

Monitor the following metrics:

- Service health endpoints
- Sync job status via `/api/sync/jobs`
- Import job status via `/api/import/jobs`
- Webhook processing via `/api/webhooks/events`
- API response times
- Error rates in logs

### Logging

All services use centralized logging via the logging-microservice. Logs are also written locally to the `./logs` directory.

## Usage Examples

### Import Products from CSV

```bash
curl -X POST http://localhost:3411/api/import/csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@products.csv"
```

### Sync Database to Allegro

```bash
curl -X POST http://localhost:3411/api/sync/db-to-allegro \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Allegro Offer

```bash
curl -X POST http://localhost:3411/api/allegro/offers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product Name",
    "categoryId": "123",
    "price": 100.00,
    "quantity": 10
  }'
```

## Testing

### Unit Tests

- Test individual service methods
- Test transformation logic
- Test conflict resolution

### Integration Tests

- Test API endpoints
- Test database operations
- Test Allegro API integration

### End-to-End Tests

- Test complete import flow
- Test complete sync flow
- Test order processing flow

## Troubleshooting

### Database Connection Issues

- Verify database credentials in `.env`
- Check that database server is accessible
- Ensure `allegro` database exists

### Allegro API Issues

- Verify `ALLEGRO_CLIENT_ID` and `ALLEGRO_CLIENT_SECRET`
- Check token expiration and refresh logic
- Verify API endpoint URLs

### Sync Issues

- Check sync job status via `/api/sync/jobs`
- Review conflict resolution strategy
- Verify product data integrity

## Documentation

- **Implementation Plan**: See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed architecture and implementation details
- **Allegro API**: See [Allegro Developer Portal](https://developer.allegro.pl/documentation) for API documentation
- **Prisma Schema**: See `prisma/schema.prisma` for database schema definition
