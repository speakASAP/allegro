# How to Check Logs for Performance Issues

## Quick Commands to Check Logs

### 1. Check Docker Container Logs (Production Server)

```bash
# SSH to production server
ssh statex

# Navigate to project directory
cd /home/statex/allegro-service 

# Check recent logs from a specific container (last 500 lines)
docker logs allegro-settings-green --tail 500

# Check logs with timing information
docker logs allegro-settings-green --since 5m | grep -E '\[TIMING\]'

# Check logs for specific request ID
docker logs allegro-api-gateway-green --since 10m | grep -E 'req-1765654688856'

# Check all services for timing logs
docker logs allegro-settings-green --since 5m | grep -E '\[TIMING\]' | tail -50
docker logs allegro-green --since 5m | grep -E '\[TIMING\]' | tail -50
docker logs allegro-api-gateway-green --since 5m | grep -E '\[TIMING\]' | tail -50
```

### 2. Check Log Files Inside Containers

Logs are written to `/app/services/{service}/logs` inside each container:

```bash
# Check settings service logs inside container
docker exec allegro-settings-green cat /app/services/settings/logs/all.log | tail -100

# Check for timing logs in settings service
docker exec allegro-settings-green cat /app/services/settings/logs/all.log | grep -E '\[TIMING\]' | tail -50

# Check allegro service logs
docker exec allegro-green cat /app/services/allegro-service/logs/all.log | tail -100

# Check for timing logs in allegro service
docker exec allegro-green cat /app/services/allegro-service/logs/all.log | grep -E '\[TIMING\]' | tail -50

# Check error logs
docker exec allegro-settings-green cat /app/services/settings/logs/error.log | tail -50
docker exec allegro-green cat /app/services/allegro-service/logs/error.log | tail -50
```

### 3. Real-time Log Monitoring

```bash
# Follow logs in real-time (like tail -f)
docker logs -f allegro-settings-green

# Follow logs with timing filter
docker logs -f allegro-settings-green | grep -E '\[TIMING\]'

# Follow multiple containers
docker logs -f allegro-settings-green allegro-green allegro-api-gateway-green
```

### 4. Check Specific Timing Breakdown

To see the full request lifecycle timing:

```bash
# Settings request timing breakdown
docker logs allegro-api-gateway-green --since 10m | grep -E 'req-.*settings|TIMING.*settings' -A 5 -B 5
docker logs allegro-settings-green --since 10m | grep -E '\[TIMING\]|JwtAuthGuard|SettingsController|SettingsService' | tail -30

# Offers request timing breakdown  
docker logs allegro-api-gateway-green --since 10m | grep -E 'req-.*offers|TIMING.*offers' -A 5 -B 5
docker logs allegro-green --since 10m | grep -E '\[TIMING\]|JwtAuthGuard|OffersController|OffersService' | tail -30

# Orders request timing breakdown
docker logs allegro-api-gateway-green --since 10m | grep -E 'req-.*orders|TIMING.*orders' -A 5 -B 5
docker logs allegro-green --since 10m | grep -E '\[TIMING\]|JwtAuthGuard|OrdersController|OrdersService' | tail -30
```

### 5. Check Log Files Location Inside Containers

```bash
# List log files in settings container
docker exec allegro-settings-green ls -lah /app/services/settings/logs/

# List log files in allegro container
docker exec allegro-green ls -lah /app/services/allegro-service/logs/

# Check current working directory in container
docker exec allegro-settings-green pwd

# Find all log files in container
docker exec allegro-settings-green find /app -name "*.log" -type f
```

### 6. Export Logs for Analysis

```bash
# Export logs to local file
docker logs allegro-settings-green --since 1h > /tmp/settings-logs.txt
docker logs allegro-green --since 1h > /tmp/allegro-logs.txt
docker logs allegro-api-gateway-green --since 1h > /tmp/gateway-logs.txt

# Export only timing logs
docker logs allegro-settings-green --since 1h | grep -E '\[TIMING\]' > /tmp/settings-timing.txt
docker logs allegro-green --since 1h | grep -E '\[TIMING\]' > /tmp/allegro-timing.txt
```

### 7. Check Logs for Specific Time Range

```bash
# Check logs from last 5 minutes
docker logs allegro-settings-green --since 5m

# Check logs from last hour
docker logs allegro-settings-green --since 1h

# Check logs from specific time
docker logs allegro-settings-green --since 2025-12-13T19:00:00

# Check logs between two times
docker logs allegro-settings-green --since 2025-12-13T19:00:00 --until 2025-12-13T20:00:00
```

## Understanding Timing Logs

Timing logs follow this pattern:

- `[TIMING] ... START` - Operation started
- `[TIMING] ... COMPLETE (Xms)` - Operation completed with duration

### Example Timing Flow for Settings Request

1. **Gateway**: `[TIMING] GatewayController.routeRequest START`
2. **Gateway**: `[TIMING] GatewayService.forwardRequest START`
3. **Settings Container**: `[TIMING] JwtAuthGuard.canActivate START` (if auth is slow)
4. **Settings Container**: `[TIMING] SettingsController.getSettings START`
5. **Settings Container**: `[TIMING] SettingsService.getSettings START`
6. **Settings Container**: `[TIMING] SettingsService.getSettings: Database query completed (Xms)`
7. **Settings Container**: `[TIMING] SettingsService.getSettings COMPLETE (Xms total)`
8. **Settings Container**: `[TIMING] SettingsController.getSettings COMPLETE (Xms total)`
9. **Gateway**: `[TIMING] GatewayService.forwardRequest COMPLETE (Xms)`
10. **Gateway**: `[TIMING] GatewayController.routeRequest COMPLETE (Xms)`

The gap between steps 2 and 3 is the HTTP connection delay we're investigating.

## What to Look For

When checking logs, look for:

1. **Large gaps between Gateway forward and Controller START** - indicates HTTP connection delay
2. **Slow JwtAuthGuard** - indicates authentication bottleneck
3. **Slow database queries** - indicates database performance issue
4. **Slow service methods** - indicates business logic bottleneck

## Troubleshooting

If logs are not appearing:

1. **Check container is running**: `docker ps | grep allegro`
2. **Check container logs are enabled**: `docker logs allegro-settings-green --tail 10`
3. **Check log files exist**: `docker exec allegro-settings-green ls -la /app/services/settings/logs/`
4. **Check service is writing logs**: `docker exec allegro-settings-green cat /app/services/settings/logs/all.log | tail -20`
