# Event Polling Implementation

## Overview

Allegro API uses event polling instead of webhooks. The system polls Allegro API endpoints periodically to fetch new events related to offers and orders.

## Event Polling Endpoints

### Offer Events Endpoints

- **Endpoint**: `GET /sale/offer-events`
- **Parameters**:
  - `after` (optional): Event ID to start after (for incremental polling)
  - `limit` (default: 100): Maximum number of events to return
- **Response Format**: `{ events: [...], lastEventId: "..." }`

### Order Events Endpoints

- **Endpoint**: `GET /order/events` (may not be available)
- **Note**: If order events endpoint doesn't exist, order updates are handled via the order sync service (`/order/orders`)

## Event Types

### Offer Events Types

- `OFFER_CREATED` → `offer.created`
- `OFFER_UPDATED` → `offer.updated`
- `OFFER_ENDED` → `offer.ended`
- `OFFER_STOCK_CHANGED` → `inventory.updated`
- `OFFER_PRICE_CHANGED` → `offer.updated`
- `OFFER_QUANTITY_CHANGED` → `inventory.updated`
- `OFFER_ACTIVATED` → `offer.updated`
- `OFFER_DEACTIVATED` → `offer.updated`

### Order Events Types

- `ORDER_CREATED` → `order.created`
- `ORDER_UPDATED` → `order.updated`
- `ORDER_PAID` → `order.updated`
- `ORDER_SENT` → `order.updated`
- `ORDER_CANCELLED` → `order.updated`
- `ORDER_FULFILLED` → `order.updated`
- `ORDER_REFUNDED` → `order.updated`

## Configuration

### Polling Interval

- **Default**: Every 37 minutes
- **Environment Variable**: `EVENT_POLLING_INTERVAL`
- **Cron Format**: `*/37 * * * *`

### Manual Polling

You can manually trigger event polling by calling:

```bash
POST /api/webhooks/poll-events
```

## Event Processing Flow

1. **Scheduled Task**: `PollAllegroEventsTask` runs every 37 minutes
2. **Poll Events**: Calls Allegro API endpoints to fetch new events
3. **Check Duplicates**: Verifies event hasn't been processed before
4. **Process Event**: Routes event to appropriate handler based on type
5. **Store Event**: Saves event to database with processing status
6. **Track Last ID**: Updates last processed event ID for next poll

## Event Handlers

- **Order Created**: `OrderCreatedHandler` - Creates order in database, updates stock
- **Order Updated**: `OrderUpdatedHandler` - Updates order status, sends notifications
- **Offer Updated**: `OfferUpdatedHandler` - Updates offer details in database
- **Inventory Updated**: `InventoryUpdatedHandler` - Updates stock levels, checks for low stock

## Testing Event Polling

### 1. Manual Test

```bash
curl -X POST http://localhost:3411/api/webhooks/poll-events
```

### 2. Check Logs

Monitor the webhook service logs for:

- Event polling start/completion
- Number of events processed
- Any errors during polling

### 3. Verify Events

```bash
curl http://localhost:3411/api/webhooks/events
```

### 4. Check Database

Query the `webhook_events` table to see processed events:

```sql
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;
```

## Troubleshooting

### No Events Being Polled

1. Check Allegro API credentials (`ALLEGRO_CLIENT_ID`, `ALLEGRO_CLIENT_SECRET`)
2. Verify access token is valid
3. Check if there are actually new events in Allegro
4. Review logs for API errors

### Events Not Processing

1. Check event format matches expected structure
2. Verify event handlers are working correctly
3. Check database for processing errors
4. Review `processingError` field in `webhook_events` table

### Duplicate Events

- The system checks for existing events by `eventId` before processing
- If duplicates occur, check the event ID generation logic

## API Response Format

### Expected Offer Events Response

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
        ...
      }
    }
  ],
  "lastEventId": "event-id-123"
}
```

### Expected Order Events Response

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
        ...
      }
    }
  ],
  "lastEventId": "event-id-456"
}
```

## Notes

- Event polling uses the `after` parameter (not `from`) to fetch events incrementally
- The system tracks the last processed event ID to avoid reprocessing
- If an event endpoint doesn't exist (e.g., `/order/events`), the system gracefully handles it
- Order updates may be handled via the existing order sync service instead of events
