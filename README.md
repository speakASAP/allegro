# Allegro Integration System

Fully automated NestJS microservices system for managing sales on Allegro.cz marketplace.

## Overview

This system provides complete automation for:

- Importing existing Allegro offers into our database
- Importing products from BizBox CSV files, transforming to Allegro format, and publishing
- Managing Allegro offers, orders, and categories
- Integrating with external shared microservices (database, logging, auth, notifications)

## Architecture

The system consists of 5 microservices:

1. **API Gateway** (Port ${API_GATEWAY_PORT:-3411}) - Request routing and authentication
2. **Allegro Service** (Port ${ALLEGRO_SERVICE_PORT:-3403}) - Allegro API integration
3. **Import Service** (Port ${IMPORT_SERVICE_PORT:-3406}) - CSV import and transformation
4. **Settings Service** (Port ${ALLEGRO_SETTINGS_SERVICE_PORT:-3408}) - User settings and API key management
5. **Frontend Service** (Port ${ALLEGRO_FRONTEND_SERVICE_PORT:-3410}) - Web interface for users

**Note**: All ports are configured in `allegro/.env`. The values shown are defaults.

## 🔌 Port Configuration

**Port Range**: 34xx (allegro application)

All services use the same host and container ports for consistency:

| Service | Host Port | Container Port | .env Variable | Description |
|---------|-----------|----------------|---------------|-------------|
| **API Gateway** | `${API_GATEWAY_PORT:-3411}` | `${API_GATEWAY_PORT:-3411}` | `API_GATEWAY_PORT` (allegro/.env) | Request routing and authentication |
| **Allegro Service** | `${ALLEGRO_SERVICE_PORT:-3403}` | `${ALLEGRO_SERVICE_PORT:-3403}` | `ALLEGRO_SERVICE_PORT` (allegro/.env) | Allegro API integration |
| **Import Service** | `${IMPORT_SERVICE_PORT:-3406}` | `${IMPORT_SERVICE_PORT:-3406}` | `IMPORT_SERVICE_PORT` (allegro/.env) | CSV import and transformation |
| **Settings Service** | `${ALLEGRO_SETTINGS_SERVICE_PORT:-3408}` | `${ALLEGRO_SETTINGS_SERVICE_PORT:-3408}` | `ALLEGRO_SETTINGS_SERVICE_PORT` (allegro/.env) | User settings and API key management |
| **Frontend Service** | `${ALLEGRO_FRONTEND_SERVICE_PORT:-3410}` | `${ALLEGRO_FRONTEND_SERVICE_PORT:-3410}` | `ALLEGRO_FRONTEND_SERVICE_PORT` (allegro/.env) | Web interface for users |

**Note**: All ports are configured in `allegro/.env`. The values shown are defaults. All ports are exposed on `127.0.0.1` only (localhost) for security. External access is provided via nginx-microservice reverse proxy.

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
   docker compose up -d
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

All ports are configured in `allegro/.env`. The values shown are defaults:

- `API_GATEWAY_PORT` - API Gateway port (default: 3411)
- `ALLEGRO_SERVICE_PORT` - Allegro Service port (default: 3403)
- `IMPORT_SERVICE_PORT` - Import Service port (default: 3406)
- `ALLEGRO_SETTINGS_SERVICE_PORT` - Settings Service port (default: 3408)
- `ALLEGRO_FRONTEND_SERVICE_PORT` - Frontend Service port (default: 3410)

### Allegro API Configuration

- `ALLEGRO_CLIENT_ID` - Allegro API client ID
- `ALLEGRO_CLIENT_SECRET` - Allegro API client secret
- `ALLEGRO_REDIRECT_URI` - OAuth redirect URI for authentication (e.g., `http://localhost:3410/auth/callback` for dev, `https://allegro.statex.cz/auth/callback` for prod)
- `ALLEGRO_OAUTH_AUTHORIZE_URL` - Allegro OAuth authorization URL (default: `https://allegro.pl/auth/oauth/authorize`)
- `ALLEGRO_OAUTH_TOKEN_URL` - Allegro OAuth token URL (default: `https://allegro.pl/auth/oauth/token`)
- `ALLEGRO_API_URL` - Allegro API URL (<https://api.allegro.pl>)
- `ALLEGRO_API_SANDBOX_URL` - Allegro Sandbox API URL
- `ALLEGRO_USE_SANDBOX` - Use sandbox environment (false)

**Note**: To access user-specific resources like `/sale/offers`, you must use OAuth Authorization Code Flow. The `client_credentials` grant type only provides access to public endpoints. Users need to authorize the application via OAuth in the Settings page.

### Import Configuration

- `IMPORT_CSV_MAX_SIZE` - Maximum CSV file size in bytes (104857600 = 100MB)
- `IMPORT_CSV_BATCH_SIZE` - Rows per batch (50)

### Notification Configuration

- `NOTIFICATION_ORDER_CREATED` - Send notifications on order creation (true)
- `NOTIFICATION_ORDER_UPDATED` - Send notifications on order updates (true)
- `NOTIFICATION_STOCK_LOW` - Send notifications on low stock (true)
- `NOTIFICATION_EMAIL_TO` - Admin email for notifications

For a complete list of all environment variables, see the `.env.example` file in the root directory or check `docs/IMPLEMENTATION_PLAN.md` section "Environment Configuration".

**Important**: All configuration values must be set in the `.env` file. The application will fail to start if required variables are missing. No hardcoded defaults are used in the codebase.

## API Endpoints

All requests go through API Gateway at `http://localhost:${API_GATEWAY_PORT:-3411}/api` (port configured in `allegro/.env`)

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

### Settings Service Endpoints

- `GET /api/settings` - Get current user settings (auth required)
- `PUT /api/settings` - Update user settings (auth required)
- `POST /api/settings/suppliers` - Add supplier configuration (auth required)
- `PUT /api/settings/suppliers/:id` - Update supplier configuration (auth required)
- `DELETE /api/settings/suppliers/:id` - Remove supplier configuration (auth required)
- `POST /api/settings/validate/allegro` - Validate Allegro API keys (auth required)

### Auth Endpoints (via API Gateway)

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token

## Database Schema

The system uses a new `allegro` database on the shared database-server with the following main tables:

- `products` - Products from BizBox/our system
- `allegro_offers` - Allegro offers mapped to products
- `allegro_orders` - Orders from Allegro
- `sync_jobs` - Sync operation logs
- `import_jobs` - CSV import job tracking
- `webhook_events` - Incoming webhook events log
- `supplier_products` - Supplier API integration (placeholder)
- `user_settings` - User settings and API keys (encrypted)

## Deployment

### Docker Compose

All services run in Docker containers connected to `nginx-network`. To deploy:

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Health Checks

All services expose `/health` endpoints for monitoring (ports configured in `allegro/.env`):

- API Gateway: `http://localhost:${API_GATEWAY_PORT:-3411}/health`
- Allegro Service: `http://localhost:${ALLEGRO_SERVICE_PORT:-3403}/health`
- Import Service: `http://localhost:${IMPORT_SERVICE_PORT:-3406}/health`
- Settings Service: `http://localhost:${ALLEGRO_SETTINGS_SERVICE_PORT:-3408}/health`
- Frontend Service: `http://localhost:${ALLEGRO_FRONTEND_SERVICE_PORT:-3410}/health`

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
# Port configured in allegro/.env: API_GATEWAY_PORT (default: 3411)
curl -X POST http://localhost:${API_GATEWAY_PORT:-3411}/api/import/csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@products.csv"
```

### Sync Database to Allegro

```bash
# Port configured in allegro/.env: API_GATEWAY_PORT (default: 3411)
curl -X POST http://localhost:${API_GATEWAY_PORT:-3411}/api/sync/db-to-allegro \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Allegro Offer

```bash
# Port configured in allegro/.env: API_GATEWAY_PORT (default: 3411)
curl -X POST http://localhost:${API_GATEWAY_PORT:-3411}/api/allegro/offers \
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

### Event Polling Tests

Test the event polling functionality:

```bash
# Run TypeScript test script
npm run test:event-polling

# Or run bash test script
npm run test:event-polling:bash

# Manual test - trigger event polling
# Port configured in allegro/.env: API_GATEWAY_PORT (default: 3411)
curl -X POST http://localhost:${API_GATEWAY_PORT:-3411}/api/webhooks/poll-events
```

See [TESTING_EVENT_POLLING.md](./docs/TESTING_EVENT_POLLING.md) for comprehensive testing instructions.

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
- Verify event format matches Allegro API response structure

## Frontend Access

The web interface is available at:

- **Development**: `http://localhost:${ALLEGRO_FRONTEND_SERVICE_PORT:-3410}` (port configured in `allegro/.env`)
- **Production**: Configured via nginx reverse proxy

### Frontend Features

- **Landing Page**: Public page with features, pricing, and registration
- **User Registration/Login**: Integrated with auth-microservice
- **Dashboard**: Secure dashboard for authenticated users with:
  - Settings page for managing Allegro and supplier API keys
  - Import jobs overview
  - Orders management

## Documentation

- **Implementation Plan**: See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed architecture and implementation details
- **Allegro API**: See [Allegro Developer Portal](https://developer.allegro.pl/documentation) for API documentation
- **Prisma Schema**: See `prisma/schema.prisma` for database schema definition
