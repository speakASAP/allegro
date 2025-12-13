# How to Check Logs for Publish Errors

## Quick Commands to Check Logs

### 1. Check Docker Container Logs (Production Server)

```bash
# SSH to production server
ssh statex

# Navigate to project directory
cd /home/statex/allegro

# Check recent logs from allegro-green container (last 500 lines)
docker logs allegro-green --tail 500 | grep -E "publish|FAILED|ERROR|offer-1|offer-2|offer-3"

# Or check all recent error logs
docker logs allegro-green --tail 500 | grep -i error

# Check logs for specific offer IDs
docker logs allegro-green --tail 1000 | grep -E "5bcf9f60-f7bc-435f-b602-42ee897163e0|a2bf9595-1f40-4258-91e1-a432f0794e52|b05c3fd0-bf5e-4e2c-93f3-e173d39de84f"

# Check for publish-all request logs
docker logs allegro-green --tail 1000 | grep -E "publishAllOffers|publishOffersToAllegro|PUBLISH ALL"
```

### 2. Check Local Log Files

Logs are also written to `./logs` directory (mounted from Docker):

```bash
# On production server
cd /home/statex/allegro

# Check error log file
tail -n 200 logs/error.log | grep -E "publish|FAILED|ERROR"

# Check all log file
tail -n 500 logs/all.log | grep -E "publish|FAILED|ERROR"

# Check for specific offer IDs in logs
grep -E "5bcf9f60-f7bc-435f-b602-42ee897163e0|a2bf9595-1f40-4258-91e1-a432f0794e52|b05c3fd0-bf5e-4e2c-93f3-e173d39de84f" logs/error.log
```

### 3. Check Centralized Logging Service

Logs are also sent to the centralized logging service at `https://logging.statex.cz`. You can access the web interface to search for logs.

### 4. Check API Gateway Logs

```bash
# Check API Gateway logs for publish-all requests
docker logs allegro-api-gateway-green --tail 200 | grep -E "publish-all|publishAll"
```

## What to Look For

When checking logs, look for:

1. **Request ID**: Each publish-all request has a unique request ID like `publish-1234567890-abc123`
2. **Offer-specific errors**: Look for logs with the offer IDs:
   - `5bcf9f60-f7bc-435f-b602-42ee897163e0`
   - `a2bf9595-1f40-4258-91e1-a432f0794e52`
   - `b05c3fd0-bf5e-4e2c-93f3-e173d39de84f`
3. **Error details**: Look for lines containing:
   - `FAILED - Failed to update offer`
   - `FAILED - Failed to create offer`
   - `CRITICAL ERROR - Failed to process offer`
   - `extractedErrorMessage`
   - `errorData`
   - `errorStatus`

## Common Error Patterns

- **422 Validation Error**: Usually means missing required fields, invalid category, or image issues
- **401/403 OAuth Error**: Token expired or invalid - need to re-authorize
- **404 Not Found**: Offer or product was deleted
- **429 Rate Limit**: Too many requests - need to wait
- **Network/Timeout Errors**: Connection issues with Allegro API

