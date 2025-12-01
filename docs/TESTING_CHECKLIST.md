# Event Polling Testing Checklist

Use this checklist to verify the event polling implementation is working correctly.

## Pre-Testing Setup

- [ ] All services are running (`docker compose up -d` or `npm run start:dev`)
- [ ] Environment variables are set in `.env`:
  - [ ] `ALLEGRO_CLIENT_ID`
  - [ ] `ALLEGRO_CLIENT_SECRET`
  - [ ] `ALLEGRO_SERVICE_URL`
  - [ ] `WEBHOOK_SERVICE_URL`
- [ ] Database is accessible and migrations are up to date
- [ ] Allegro API credentials are valid

## Service Health Checks

- [ ] Webhook service health endpoint responds: `curl http://localhost:3405/health`
- [ ] Allegro service health endpoint responds: `curl http://localhost:3403/health`
- [ ] Scheduler service health endpoint responds: `curl http://localhost:3407/health`

## Event Polling Endpoints

- [ ] `POST /api/webhooks/poll-events` returns success response
- [ ] `GET /allegro/events/offers` returns events or empty array
- [ ] `GET /allegro/events/orders` returns events or 404 (if endpoint doesn't exist)
- [ ] Endpoints accept `after` parameter for incremental polling
- [ ] Endpoints accept `limit` parameter

## Event Processing

- [ ] Events are fetched from Allegro API
- [ ] Events are saved to `webhook_events` table
- [ ] Events are processed by appropriate handlers
- [ ] Duplicate events are not processed twice
- [ ] Last event ID is tracked for next poll

## Event Handlers

- [ ] Order created events create orders in database
- [ ] Order updated events update order status
- [ ] Offer updated events update offer details
- [ ] Inventory updated events update stock levels
- [ ] Low stock notifications are sent when applicable

## Scheduled Polling

- [ ] Scheduler service is running
- [ ] Event polling task is registered
- [ ] Task runs on schedule (every 37 minutes by default)
- [ ] Logs show polling activity

## Error Handling

- [ ] API errors are logged appropriately
- [ ] Failed events are marked with error messages
- [ ] Retry mechanism works for failed events
- [ ] Service continues running after errors

## Event Format Verification

- [ ] Offer events have correct structure:
  - [ ] `id` field present
  - [ ] `type` field present
  - [ ] `offer` object present
- [ ] Order events have correct structure:
  - [ ] `id` field present
  - [ ] `type` field present
  - [ ] `order` object present
- [ ] Event types are mapped correctly to internal types

## Database Verification

- [ ] Events are stored in `webhook_events` table
- [ ] `eventId` is unique (no duplicates)
- [ ] `processed` flag is set correctly
- [ ] `processedAt` timestamp is set when processed
- [ ] Error messages are stored for failed events

## Performance

- [ ] Polling completes within reasonable time (< 30 seconds)
- [ ] Large batches (100+ events) are handled correctly
- [ ] No memory leaks during polling
- [ ] Database queries are efficient

## Integration Testing

- [ ] Test with real Allegro API (sandbox or production)
- [ ] Verify events match actual Allegro data
- [ ] Test with different event types
- [ ] Test with empty event responses
- [ ] Test with API errors/rate limits

## Documentation

- [ ] `EVENT_POLLING.md` is up to date
- [ ] `TESTING_EVENT_POLLING.md` is complete
- [ ] README.md reflects event polling instead of webhooks
- [ ] Code comments explain event format handling

## Production Readiness

- [ ] Logging is comprehensive
- [ ] Error monitoring is in place
- [ ] Polling interval is appropriate for production
- [ ] Rate limiting is handled
- [ ] Database indexes are optimized

## Quick Test Commands

```bash
# Run automated tests
npm run test:event-polling

# Or use bash script
npm run test:event-polling:bash

# Manual polling
curl -X POST http://localhost:3411/api/webhooks/poll-events

# Check processed events
curl http://localhost:3411/api/webhooks/events?limit=10
```

## Notes

- If order events endpoint doesn't exist, this is expected - order updates are handled via sync service
- Event format may vary - adjust parsing logic if Allegro returns different structure
- Polling interval can be adjusted via `EVENT_POLLING_INTERVAL` environment variable
