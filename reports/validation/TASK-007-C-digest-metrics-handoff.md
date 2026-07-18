# TASK-007-C Digest Metrics Handoff

## Scope

TASK-007-C owns the notification digest metrics lane for `TASK-007` only. This handoff defines a draft daily/weekly digest payload, metric definitions, deterministic aggregation windows, source mappings to current repo data, synthetic validation cases, and blockers for missing contracts or data sources.

## Intent Chain References

Vision -> `docs/01_vision/VISION.md` (`VG-002`, `VG-003`, `VG-004`)
Goal Impact -> `docs/22_goal_impact/GOAL-IMPACT-TASK-007.md`
System -> `SYSTEM.md`, `docs/04_systems/SYS-001-allegro-marketplace-integration.md`
Feature -> `docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md`
Task -> `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md`
Execution Plan -> `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`
Code -> `prisma/schema.prisma`, `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts`, `services/allegro-service/src/allegro/orders/orders.service.ts`, `services/allegro-service/src/allegro/inventory/inventory.service.ts`, `services/allegro-service/src/allegro/policy/policy-engine.service.ts`, `services/allegro-service/src/allegro/offers/offers.service.ts`, `services/allegro-service/src/allegro/events/events.service.ts`
Validation -> synthetic cases in this handoff; final task validation remains owned by TASK-007-E

## Deterministic Aggregation Windows

- Timezone: `UTC` for all computed windows.
- Daily window: `[day_start, next_day_start)`, where `day_start` is `00:00:00Z`.
- Weekly window: ISO week window `[monday_00:00:00Z, next_monday_00:00:00Z)`.
- Inclusion rule: start inclusive, end exclusive.
- Event metrics use the persisted event timestamp field named in each metric definition.
- Snapshot metrics use render-time state only and must be labeled `snapshot_as_of`.
- `[MISSING: approved business timezone for operator-facing digest rendering]`
- `[MISSING: approved scheduler cadence and delivery owner for notifications-microservice digest runs]`

## Daily Digest Payload Draft

```json
{
  "contractVersion": "task-007.digest.v0",
  "digestType": "daily",
  "window": {
    "timezone": "UTC",
    "start": "2026-06-19T00:00:00Z",
    "end": "2026-06-20T00:00:00Z"
  },
  "summary": {
    "ordersTotal": 12,
    "grossRevenueTotal": "1499.88",
    "publishSucceededTotal": 7,
    "publishFailedTotal": 2,
    "publishBlockedTotal": 3,
    "stalePublishAttemptsSnapshot": 1
  },
  "orders": {
    "paidOrdersTotal": 10,
    "cancelledOrdersTotal": 1,
    "refundedOrdersTotal": 1,
    "topCurrency": "PLN"
  },
  "publish": {
    "topBlockedReasons": [
      { "gate": "category-readiness", "count": 2 },
      { "gate": "price-margin-readiness", "count": 1 }
    ]
  },
  "opportunities": {
    "activeOffersOutOfStockSnapshot": 4,
    "offersWithValidationErrorsSnapshot": 3,
    "offersWithSyncErrorSnapshot": 2
  },
  "redactionReport": {
    "classification": "synthetic",
    "containsCustomerIdentifiers": false,
    "containsRawOrderRecords": false,
    "containsSecrets": false
  }
}
```

## Weekly Digest Payload Draft

```json
{
  "contractVersion": "task-007.digest.v0",
  "digestType": "weekly",
  "window": {
    "timezone": "UTC",
    "start": "2026-06-15T00:00:00Z",
    "end": "2026-06-22T00:00:00Z"
  },
  "summary": {
    "ordersTotal": 68,
    "grossRevenueTotal": "9120.44",
    "publishSucceededTotal": 41,
    "publishFailedTotal": 8,
    "publishBlockedTotal": 11
  },
  "trends": {
    "dailyOrderCounts": [8, 11, 9, 12, 10, 7, 11],
    "dailyPublishSuccessCounts": [6, 4, 5, 8, 7, 5, 6]
  },
  "blockers": {
    "topBlockedReasons": [
      { "gate": "category-readiness", "count": 5 },
      { "gate": "media-readiness", "count": 3 },
      { "gate": "price-margin-readiness", "count": 3 }
    ]
  },
  "snapshotAsOf": {
    "activeOffersOutOfStock": 4,
    "offersWithValidationErrors": 3,
    "offersWithSyncError": 2
  },
  "missingSignals": [
    "clickstream",
    "margin",
    "notification_delivery_status",
    "persistent_order_forward_result"
  ]
}
```

## Metric Definitions

| Metric | Window Type | Calculation | Source field(s) | Notes |
|---|---|---|---|---|
| `orders_total` | event | Count `AllegroOrder` rows where `orderDate` is in window. | `allegro_orders.orderDate` | Deterministic historical metric. |
| `gross_revenue_total` | event | Sum `AllegroOrder.totalPrice` where `orderDate` is in window. | `allegro_orders.totalPrice`, `orderDate`, `currency` | Gross order value only; no margin/profit deduction. |
| `paid_orders_total` | event | Count rows with `paymentStatus = "PAID"` and `orderDate` in window. | `allegro_orders.paymentStatus`, `orderDate` | Uses local order projection. |
| `cancelled_orders_total` | event | Count rows with `status = "CANCELLED"` and `orderDate` in window. | `allegro_orders.status`, `orderDate` | Deterministic if cancellation updates overwrite the same order row. |
| `refunded_orders_total` | event | Count rows with `paymentStatus = "REFUNDED"` and `orderDate` in window. | `allegro_orders.paymentStatus`, `orderDate` | Refund amount is unavailable unless derived from order total. |
| `publish_attempts_total` | event | Count `AllegroPublishAttempt` rows with `createdAt` in window. | `allegro_publish_attempts.createdAt` | Includes all publish/update/end actions unless filtered to `action = "PUBLISH"`. |
| `publish_succeeded_total` | event | Count rows with `status = "SUCCEEDED"` and `createdAt` in window. | `allegro_publish_attempts.status`, `createdAt` | Tracks completion outcome for locally governed attempts. |
| `publish_failed_total` | event | Count rows with `status = "FAILED"` and `createdAt` in window. | `allegro_publish_attempts.status`, `createdAt` | Failure details are redacted in `failureContext`. |
| `publish_blocked_total` | event | Count rows with `status = "BLOCKED"` and `createdAt` in window. | `allegro_publish_attempts.status`, `createdAt` | Use `blockedReasons` for blocker grouping. |
| `blocked_reason_counts` | event | Flatten `blockedReasons[]` and count by `gate` for rows with `status = "BLOCKED"` and `createdAt` in window. | `allegro_publish_attempts.blockedReasons`, `createdAt` | Supports operator action digest. |
| `stale_publish_attempts_snapshot` | snapshot | Count attempts whose derived status is `STALE` at render time. | `allegro_publish_attempts.status`, `staleAt` | Snapshot only; historical stale count is not persisted. |
| `active_offers_out_of_stock_snapshot` | snapshot | Count offers with `publicationStatus = "ACTIVE"` and `stockQuantity <= 0` at render time. | `allegro_offers.publicationStatus`, `stockQuantity` | Current opportunity signal, not backfillable historically. |
| `offers_with_validation_errors_snapshot` | snapshot | Count offers with `validationStatus = "ERRORS"` at render time. | `allegro_offers.validationStatus` | Current readiness blocker signal. |
| `offers_with_sync_error_snapshot` | snapshot | Count offers with `syncStatus = "ERROR"` at render time. | `allegro_offers.syncStatus` | Current sync recovery queue. |

## Source Mapping To Current Events And Data

| Digest concern | Current repo source | Available now | Notes |
|---|---|---|---|
| Publish outcomes | `AllegroPublishAttempt` model and `PublishLifecycleService` | Yes | Local governed lifecycle persists `status`, `blockedReasons`, timestamps, and redacted failures. |
| Publish blocker breakdown | `PublishLifecycleService.prepare()` plus `MarketplacePolicyEngineService` gates | Yes | Gate names include `category-readiness`, `attribute-readiness`, `media-readiness`, `stock-readiness`, `price-margin-readiness`, `delivery-readiness`, `payment-readiness`, `gpsr-producer-readiness`. |
| Order volume and gross revenue | `AllegroOrder` model and `OrdersService.syncOrdersFromAllegro()` | Yes | Local projection stores `orderDate`, `totalPrice`, `currency`, `status`, and `paymentStatus`. |
| Order forwarding result | `OrdersService.syncOrdersFromAllegro()` logs only | Partial | Success and failure are logged, but no durable forward-delivery ledger exists for deterministic digest metrics. |
| Stockout opportunities | `AllegroOffer.stockQuantity` and `InventoryService` | Partial | Snapshot metric is possible; historical stockout events are not persisted. |
| Offer readiness opportunities | `AllegroOffer.validationStatus`, `syncStatus`, `publicationStatus` | Yes for snapshots | Good for render-time operator queues. |
| Click / traffic funnel stage | `EventsService.getOfferEvents()` and `getOrderEvents()` | Partial | Polling endpoints exist, but no persisted clickstream/event warehouse was found. |
| Margin / profit | TASK-006 dependency noted in policy engine | No | `[MISSING: approved margin/profit source and contract from TASK-006 outputs]` |
| Notification delivery result | `notifications-microservice` mentioned in docs only | No | `[MISSING: notifications-microservice digest request/response contract and delivery receipt model]` |

## Recommended Metric Guardrails

- Filter publish digest metrics to `action = "PUBLISH"` for operator-facing listing health unless a broader mutation digest is explicitly desired.
- Label all `snapshot` metrics as render-time only.
- Treat `gross_revenue_total` as gross booked value, not net revenue or profit.
- Exclude `buyerEmail`, `buyerLogin`, `deliveryAddress`, `trackingNumber`, `paymentMethod`, and raw `failureContext.details` from any digest payload.
- Keep `blockedReasons` grouped by gate name only; do not emit raw per-attempt payloads.

## Synthetic Validation Cases

1. Daily publish mix
   Input: 3 `PUBLISH` attempts in window with statuses `SUCCEEDED`, `FAILED`, `BLOCKED`.
   Expected: `publishSucceededTotal = 1`, `publishFailedTotal = 1`, `publishBlockedTotal = 1`.

2. Blocked reason aggregation
   Input: 2 blocked attempts with `blockedReasons = [{"gate":"category-readiness"}]` and 1 blocked attempt with `blockedReasons = [{"gate":"category-readiness"},{"gate":"media-readiness"}]`.
   Expected: `category-readiness = 3`, `media-readiness = 1`.

3. Gross revenue sum
   Input: 2 orders in window with `totalPrice` values `199.99` and `300.00`, same currency.
   Expected: `grossRevenueTotal = "499.99"`.

4. Refund count
   Input: 1 order in window with `paymentStatus = "REFUNDED"`.
   Expected: `refundedOrdersTotal = 1`.

5. Snapshot stockout opportunity
   Input: render-time offer set includes 4 rows with `publicationStatus = "ACTIVE"` and `stockQuantity = 0`.
   Expected: `activeOffersOutOfStockSnapshot = 4`.

6. Redaction safety
   Input payload candidate includes `buyerEmail`, `buyerLogin`, `deliveryAddress`, or any token-like field.
   Expected: validation fails and the digest renderer removes the field before output.

7. Window boundary determinism
   Input: order at `2026-06-20T00:00:00Z`.
   Expected: excluded from the `2026-06-19` daily window and included in the `2026-06-20` daily window.

## Sensitive-Data Safety Review

- This handoff uses synthetic examples only.
- No secrets, OAuth tokens, real customer identifiers, raw production logs, or raw order payloads are included.
- Digest payloads should expose only aggregated counts, totals, grouped blocker gates, and render-time snapshot counts.
- Any future implementation should redact or omit `buyerEmail`, `buyerLogin`, address fields, payment method details, and raw error payloads before notification delivery.

## Blockers And Missing Facts

- `[MISSING: approved notifications-microservice digest contract, endpoint, and ownership]`
- `[MISSING: approved digest render timezone for operators if UTC is not acceptable]`
- `[MISSING: persistent clickstream or conversion-event store for clicked funnel stage]`
- `[MISSING: TASK-006-backed margin/profit dataset for net-revenue or margin digest metrics]`
- `[MISSING: durable order-forward success/failure ledger beyond application logs]`
- `[MISSING: historical stockout event ledger; current repo supports stock snapshots only]`
