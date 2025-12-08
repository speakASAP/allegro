# Local Development Setup with Production Services

This guide explains how to set up local development environment that uses production database and services via SSH.

## Overview

For local development, you'll:

- Run services locally (via `npm run start:dev` or Docker)
- Connect to production database via SSH tunnel
- Use production microservices (auth, logging, notifications) via HTTPS

## Prerequisites

1. SSH access to production server (`ssh statex` must work)
2. Node.js 20+ installed
3. Docker Desktop (optional, for containerized development)

## Step 1: Configure .env File

Your `.env` file should have the following database configuration:

```bash
# Database Configuration
DB_HOST=localhost          # ✅ Correct for SSH tunnel
DB_PORT=5432
DB_USER=dbadmin
DB_PASSWORD=
DB_NAME=allegro
DATABASE_URL=
```

**Important Notes:**

- `DB_HOST=localhost` is **correct** - the SSH tunnel forwards localhost:5432 to production
- `DATABASE_URL` should **NOT** include `?schema=public` query parameter (Prisma will add it automatically if needed)
- Password in `DATABASE_URL` must be URL-encoded (already done above)

## Step 2: External Services Configuration

For local development, you have two options:

### Option A: Use SSH Tunnels (Recommended)

Set up SSH tunnels for all services to use production services directly:

```bash
# Start all tunnels (database, auth, logging, notifications)
./scripts/setup-ssh-tunnel.sh start
```

Then configure your `.env` file:

```bash
# External Shared Microservices (via SSH tunnels)
# Note: AUTH_SERVICE_PORT is required for gateway to use localhost in development
AUTH_SERVICE_PORT=3371
AUTH_SERVICE_URL=https://auth.statex.cz  # Fallback if tunnel not available
NOTIFICATION_SERVICE_URL=http://localhost:3368
LOGGING_SERVICE_URL=http://localhost:3267
```

### Option B: Use HTTPS URLs

Use production HTTPS URLs directly (requires services to be healthy on production):

```bash
# External Shared Microservices
AUTH_SERVICE_URL=https://auth.statex.cz
NOTIFICATION_SERVICE_URL=https://notifications.statex.cz
LOGGING_SERVICE_URL=https://logging.statex.cz
```

**Note**: If you see 502 errors, the services may be down on production. Use Option A (SSH tunnels) instead.

## Step 3: Start SSH Tunnels

Before starting your local services, you must start the SSH tunnels to production services:

```bash
# Start all tunnels (database, auth, logging, notifications)
./scripts/setup-ssh-tunnel.sh start

# Check tunnel status
./scripts/setup-ssh-tunnel.sh status

# Test all connections
./scripts/setup-ssh-tunnel.sh test
```

The tunnels will:

- **Database**: Forward `localhost:5432` → `statex:127.0.0.1:5432`
- **Auth Service**: Forward `localhost:3371` → `statex:127.0.0.1:3371`
- **Logging Service**: Forward `localhost:3267` → `statex:127.0.0.1:3267`
- **Notifications Service**: Forward `localhost:3368` → `statex:127.0.0.1:3368`
- Run in the background
- Store PIDs in `/tmp/allegro-tunnels/`

### SSH Tunnel Commands

```bash
# Start all tunnels
./scripts/setup-ssh-tunnel.sh start

# Start specific tunnel
./scripts/setup-ssh-tunnel.sh start db
./scripts/setup-ssh-tunnel.sh start auth
./scripts/setup-ssh-tunnel.sh start logging
./scripts/setup-ssh-tunnel.sh start notifications

# Stop all tunnels
./scripts/setup-ssh-tunnel.sh stop

# Stop specific tunnel
./scripts/setup-ssh-tunnel.sh stop auth

# Restart all tunnels
./scripts/setup-ssh-tunnel.sh restart

# Check status of all tunnels
./scripts/setup-ssh-tunnel.sh status

# Test all connections
./scripts/setup-ssh-tunnel.sh test
```

## Step 4: Verify Database Connection

Test the database connection using Prisma:

```bash
# Test with Prisma
npx prisma db execute --stdin <<< "SELECT 1 as test;"
```

Expected output: `Script executed successfully.`

## Step 5: Start Local Services

### Option A: Development Mode (Recommended for Local Dev)

1. **Build shared module first:**

   ```bash
   cd shared
   npm run build
   cd ..
   ```

2. **Start SSH tunnel** (if not already running):

   ```bash
   ./scripts/setup-ssh-tunnel.sh start
   ```

3. **Start all services:**

   ```bash
   npm run start:dev
   ```

   This will start:
   - API Gateway (port 3411)
   - Allegro Service (port 3403)
   - Import Service (port 3406)
   - Settings Service (port 3408)
   - Frontend Service (port 3410)

### Option B: Docker Compose

1. **Start SSH tunnel:**

   ```bash
   ./scripts/setup-ssh-tunnel.sh start
   ```

2. **Start services:**

   ```bash
   docker compose up -d
   ```

## OAuth Configuration

To use OAuth for accessing user-specific Allegro resources (like `/sale/offers`), you need to configure the redirect URI:

1. **Set `ALLEGRO_REDIRECT_URI` in `.env`**:

   ```bash
   ALLEGRO_REDIRECT_URI=http://localhost:3410/auth/callback
   ```

2. **Configure in Allegro Developer Portal**:
   - Go to [Allegro Developer Portal](https://developer.allegro.pl/)
   - Add the redirect URI to your application settings
   - The URI must match exactly (including protocol and port)

3. **Authorize the Application**:
   - Go to Settings page in the application
   - Configure your Allegro Client ID and Client Secret
   - Click "Authorize with Allegro" button
   - You'll be redirected to Allegro to grant permissions
   - After authorization, you'll be redirected back to the application

**Note**: OAuth is required for accessing user-specific resources. The `client_credentials` grant type only works for public endpoints.

## Troubleshooting

### Database Connection Fails

1. **Check SSH tunnel is running:**

   ```bash
   ./scripts/setup-ssh-tunnel.sh status
   ```

2. **Verify tunnel is listening:**

   ```bash
   lsof -i :5432
   # Should show SSH process listening on port 5432
   ```

3. **Test SSH connection:**

   ```bash
   ssh statex "echo 'SSH connection works'"
   ```

4. **Check database credentials in .env:**
   - Verify `DB_HOST=localhost` (not `db-server-postgres`)
   - Verify `DB_PASSWORD` is correct
   - Verify `DATABASE_URL` has URL-encoded password

### SSH Tunnel Not Starting

1. **Check if port 5432 is already in use:**

   ```bash
   lsof -i :5432
   ```

2. **Kill existing tunnel:**

   ```bash
   ./scripts/setup-ssh-tunnel.sh stop
   ```

3. **Check for stale processes:**

   ```bash
   ps aux | grep "ssh.*5432"
   ```

### Services Can't Connect to External Services

1. **Verify HTTPS access:**

   ```bash
   curl -I https://auth.statex.cz/health
   curl -I https://logging.statex.cz/health
   curl -I https://notifications.statex.cz/health
   ```

2. **Check network connectivity:**
   - Ensure you have internet access
   - Check if firewall is blocking HTTPS connections

## Important Notes

1. **Always start SSH tunnel before services** - Services will fail to start if database is not accessible

2. **Stop tunnel when done** - To free up the port:

   ```bash
   ./scripts/setup-ssh-tunnel.sh stop
   ```

3. **Database changes affect production** - Be careful! You're working with production database

4. **Service URLs** - External services (auth, logging, notifications) use HTTPS and don't require SSH tunnel

## Quick Start Checklist

- [ ] SSH access to `statex` works (`ssh statex`)
- [ ] `.env` file configured with `DB_HOST=localhost`
- [ ] SSH tunnel started (`./scripts/setup-ssh-tunnel.sh start`)
- [ ] Database connection tested (`npx prisma db execute --stdin <<< "SELECT 1;"`)
- [ ] Shared module built (`cd shared && npm run build`)
- [ ] Services started (`npm run start:dev` or `docker compose up -d`)

## Summary

✅ **Database**: Access via SSH tunnel (`localhost:5432` → `statex:127.0.0.1:5432`)  
✅ **Auth Service**: Access via SSH tunnel (`localhost:3371` → `statex:127.0.0.1:3371`)  
✅ **Logging Service**: Access via SSH tunnel (`localhost:3267` → `statex:127.0.0.1:3267`)  
✅ **Notifications Service**: Access via SSH tunnel (`localhost:3368` → `statex:127.0.0.1:3368`)  

**Alternative**: You can use HTTPS URLs (`https://auth.statex.cz`, etc.) if services are healthy on production, but SSH tunnels are recommended for reliability.

All services run locally but connect to production infrastructure via SSH tunnels.
