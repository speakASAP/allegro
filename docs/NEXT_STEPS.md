# Next Steps - Website and Dashboard Implementation

## Prerequisites

1. **Database Server**: Ensure the database server is running and accessible
2. **External Microservices**: Ensure the following are running:
   - Auth microservice (auth.statex.cz)
   - Logging microservice (logging.statex.cz)
   - Notifications microservice (notifications.statex.cz)

## Step 1: Update Environment Variables

Add the following variables to your `.env` file:

```bash
# New Service Ports
ALLEGRO_SETTINGS_SERVICE_PORT=3408
ALLEGRO_FRONTEND_SERVICE_PORT=3410

# Service URLs (for API Gateway routing)
SETTINGS_SERVICE_URL=http://localhost:3408

# Frontend Configuration
FRONTEND_API_URL=http://localhost:3411/api

# Encryption Key (for API key encryption in settings service)
# IMPORTANT: Use a secure 32+ character key in production
ENCRYPTION_KEY=your-32-character-encryption-key-here-change-in-production
```

## Step 2: Run Database Migration

Once the database is accessible, run:

```bash
npx prisma migrate dev --name add_user_settings
```

This will:

- Create the `user_settings` table
- Update the Prisma client

## Step 3: Build and Start Services

Build and start all services including the new ones:

```bash
docker-compose up -d --build
```

Or start specific services:

```bash
docker-compose up -d allegro-settings-service allegro-frontend-service
```

## Step 4: Verify Services

Check that all services are running:

```bash
docker-compose ps
```

Verify health endpoints:

- Settings Service: `curl http://localhost:3408/health`
- Frontend Service: `curl http://localhost:3410/health`
- API Gateway: `curl http://localhost:3411/health`

## Step 5: Access the Frontend

Open your browser and navigate to:

- **Frontend**: <http://localhost:3410>
- **API Gateway**: <http://localhost:3411/api>

## Step 6: Test the Application

1. **Register a new user**:
   - Go to <http://localhost:3410>
   - Click "Get Started" or "Create Your Account"
   - Fill in the registration form

2. **Login**:
   - Use your credentials to log in
   - You should be redirected to the dashboard

3. **Configure API Keys**:
   - Navigate to Settings in the dashboard
   - Add your Allegro Client ID and Client Secret
   - Click "Validate Keys" to test them
   - Add supplier configurations if needed

4. **Explore Dashboard**:
   - Check Sync Status page
   - View Import Jobs
   - Browse Orders
   - Review Products

## Troubleshooting

### Database Connection Issues

If you see database connection errors:

- Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
- Ensure the database server container is running
- Check network connectivity: `docker network ls`

### Service Not Starting

If a service fails to start:

- Check logs: `docker-compose logs allegro-settings-service`
- Verify all environment variables are set
- Ensure ports are not already in use

### Frontend Not Loading

If the frontend doesn't load:

- Check browser console for errors
- Verify `VITE_API_URL` is set correctly (or uses default)
- Check nginx logs: `docker-compose logs allegro-frontend-service`

### Migration Issues

If migration fails:

- Ensure database is accessible
- Check database credentials
- Verify Prisma schema is correct: `npx prisma validate`

## Production Deployment

For production deployment:

1. **Set secure encryption key**:

   ```bash
   ENCRYPTION_KEY=<generate-secure-32-char-key>
   ```

2. **Configure nginx reverse proxy**:
   - Set up SSL certificates
   - Configure domain names
   - Update `FRONTEND_API_URL` to production API URL
   - **Configure frontend service routing**:
     
     Add the following to your nginx configuration file (e.g., `allegro.statex.cz.blue.conf`):
     
     ```nginx
     # Add upstream block for frontend service (after api-gateway upstream)
     upstream allegro-frontend-service {
         server allegro-frontend-service:3410 max_fails=3 fail_timeout=30s;
     }
     
     # Add location block for root path (before /api/ location)
     location / {
         proxy_pass http://allegro-frontend-service;
         proxy_http_version 1.1;
         proxy_set_header Upgrade $http_upgrade;
         proxy_set_header Connection "upgrade";
         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
         proxy_cache_bypass $http_upgrade;
         
         proxy_connect_timeout 300s;
         proxy_read_timeout 300s;
         proxy_send_timeout 300s;
         
         proxy_buffer_size 128k;
         proxy_buffers 4 256k;
         proxy_busy_buffers_size 256k;
     }
     ```
     
     Then reload nginx:
     ```bash
     docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload
     ```

3. **Update frontend environment**:
   - Set `VITE_API_URL` to production API URL
   - Rebuild frontend container

4. **Database migration**:

   ```bash
   npx prisma migrate deploy
   ```

## Additional Notes

- All API keys are encrypted before storage using AES-256-CBC
- The frontend uses React Router for navigation
- Authentication is handled via the external auth-microservice
- All services follow the "allegro-" naming convention for containers
- Services use ports 3408 (settings) and 3410 (frontend) as specified
