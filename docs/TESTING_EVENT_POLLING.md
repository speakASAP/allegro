# Testing Event Polling

This document provides comprehensive testing instructions for the Allegro event polling implementation.

## Prerequisites

1. **Services Running**: Ensure all services are running:

   ```bash
   docker compose up -d
   # OR
   npm run start:dev
   ```

2. **Environment Variables**: Verify these are set in `.env`:
   - `ALLEGRO_CLIENT_ID`
   - `ALLEGRO_CLIENT_SECRET`
   - `ALLEGRO_SERVICE_URL` (default: `http://localhost:3403`)
   - `WEBHOOK_SERVICE_URL` (default: `http://localhost:3405`)

3. **Allegro API Access**: Ensure you have valid Allegro API credentials

## Quick Test Scripts

### Option 1: TypeScript Test Script

```bash
# Install dependencies if needed
npm install

# Run the test script
npx ts-node scripts/test-event-polling.ts
```

### Option 2: Bash Test Script

```bash
# Make executable (already done)
chmod +x scripts/test-allegro-api-events.sh

# Run the test
./scripts/test-allegro-api-events.sh
```

## Manual Testing

### 1. Test Service Health

```bash
# Webhook Service
curl http://localhost:3405/health

# Allegro Service
curl http://localhost:3403/health
```

Expected: Both should return `{"status":"ok"}` or similar.

### 2. Test Event Polling Endpoint

```bash
curl -X POST http://localhost:3411/api/webhooks/poll-events
```

Expected Response:

```json
{
  "success": true,
  "data": {
    "success": true,
    "processedCount": 0
  }
}
```

### 3. Test Direct Event Endpoints

#### Offer Events

```bash
curl "http://localhost:3403/allegro/events/offers?limit=10"
```

Expected: Response from Allegro API with events array or empty if no events.

#### Order Events

```bash
curl "http://localhost:3403/allegro/events/orders?limit=10"
```

Expected: Response from Allegro API or 404 if endpoint doesn't exist (this is OK).

### 4. Test with 'after' Parameter

```bash
# Get first batch
curl "http://localhost:3403/allegro/events/offers?limit=10"

# Get next batch using last event ID
curl "http://localhost:3403/allegro/events/offers?after=LAST_EVENT_ID&limit=10"
```

### 5. Check Processed Events

```bash
# Requires authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3411/api/webhooks/events?limit=10"
```

## Testing Event Format

### Expected Offer Event Format

The Allegro API should return events in this format:

```json
{
  "events": [
    {
      "id": "event-id-123",
      "type": "OFFER_UPDATED",
      "occurredAt": "2025-01-01T12:00:00Z",
      "offer": {
        "id": "offer-id",
        "name": "Product Name",
        "sellingMode": {
          "price": {
            "amount": "100.00",
            "currency": "PLN"
          }
        },
        "stock": {
          "available": 10
        }
      }
    }
  ],
  "lastEventId": "event-id-123"
}
```

### Expected Order Event Format

```json
{
  "events": [
    {
      "id": "event-id-456",
      "type": "ORDER_CREATED",
      "occurredAt": "2025-01-01T12:00:00Z",
      "order": {
        "id": "order-id",
        "status": "NEW",
        "totalPrice": {
          "amount": "100.00",
          "currency": "PLN"
        },
        "lineItems": [
          {
            "offer": {
              "id": "offer-id"
            },
            "quantity": 1,
            "price": {
              "amount": "100.00",
              "currency": "PLN"
            }
          }
        ]
      }
    }
  ],
  "lastEventId": "event-id-456"
}
```

## Testing Event Processing

### 1. Trigger Manual Poll

```bash
curl -X POST http://localhost:3411/api/webhooks/poll-events
```

### 2. Check Logs

```bash
# Webhook Service logs
docker compose logs -f webhook-service

# Or if running locally
tail -f services/webhook-service/logs/*.log
```

Look for:

- "Polling Allegro events"
- "Fetched offer events" / "Fetched order events"
- "Event polling completed"
- Any error messages

### 3. Verify Database

```sql
-- Check processed events
SELECT 
  id,
  event_id,
  event_type,
  processed,
  created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;

-- Check for errors
SELECT 
  id,
  event_id,
  event_type,
  processing_error,
  retry_count
FROM webhook_events
WHERE processing_error IS NOT NULL
ORDER BY created_at DESC;
```

### 4. Test Event Handlers

After events are processed, verify:

- **Order Created**: Check `allegro_orders` table for new orders
- **Order Updated**: Check order status changes
- **Offer Updated**: Check `allegro_offers` table for updates
- **Inventory Updated**: Check stock quantity changes

## Testing Scheduled Polling

### 1. Check Scheduler Service

```bash
# Check if scheduler is running
curl http://localhost:3407/health

# Check scheduler logs
docker compose logs -f scheduler-service
```

### 2. Verify Cron Job

The event polling task runs every 37 minutes by default. Check logs for:

```text
Running scheduled Allegro event polling
Scheduled Allegro event polling completed
```

### 3. Adjust Polling Interval (for testing)

Temporarily change the interval in `.env`:

```env
EVENT_POLLING_INTERVAL=*/1 * * * *  # Every minute for testing
```

Then restart the scheduler service.

## Troubleshooting

### No Events Being Polled

1. **Check Allegro API Credentials**:

   ```bash
   # Verify credentials are set
   echo $ALLEGRO_CLIENT_ID
   echo $ALLEGRO_CLIENT_SECRET
   ```

2. **Check Access Token**:
   - Look for authentication errors in logs
   - Verify token is not expired

3. **Check API Response**:

   ```bash
   # Test direct API call
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "https://api.allegro.pl/sale/offer-events?limit=10"
   ```

### Events Not Processing

1. **Check Event Format**:
   - Verify the response structure matches expected format
   - Check if event type mapping is correct

2. **Check Database**:
   - Verify events are being saved
   - Check for processing errors

3. **Check Handlers**:
   - Verify handlers are registered
   - Check handler logs for errors

### Duplicate Events

The system should prevent duplicates by checking `eventId` before processing. If duplicates occur:

1. Check the `eventId` generation logic
2. Verify the `webhook_events` table has unique constraint on `eventId`
3. Check if events are being reprocessed

## Integration Testing with Real Allegro API

### 1. Set Up Sandbox Environment

```env
ALLEGRO_USE_SANDBOX=true
ALLEGRO_API_SANDBOX_URL=https://api.allegro.pl.allegrosandbox.pl
```

### 2. Create Test Events

In Allegro sandbox:

- Create/update an offer
- Create an order
- Update stock

### 3. Poll for Events

```bash
curl -X POST http://localhost:3411/api/webhooks/poll-events
```

### 4. Verify Events

Check the database and logs to ensure events were:

- Fetched from Allegro
- Saved to database
- Processed by handlers
- Applied to relevant entities

## Performance Testing

### 1. Test with Large Event Batches

```bash
# Poll with larger limit
curl "http://localhost:3403/allegro/events/offers?limit=1000"
```

### 2. Monitor Processing Time

Check logs for:

- Time taken to fetch events
- Time taken to process each event
- Total polling time

### 3. Test Concurrent Polling

```bash
# Trigger multiple polls simultaneously
for i in {1..5}; do
  curl -X POST http://localhost:3411/api/webhooks/poll-events &
done
wait
```

## Next Steps

After testing:

1. **Verify Event Format**: Adjust parsing logic if Allegro returns different format
2. **Update Event Types**: Add new event types to mapping if needed
3. **Optimize Polling**: Adjust interval based on event frequency
4. **Monitor Production**: Set up monitoring for event polling in production
