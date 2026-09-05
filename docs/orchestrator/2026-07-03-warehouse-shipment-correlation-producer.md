# Allegro Warehouse Shipment Correlation Producer

Status: source-only producer client landed; runtime call remains disabled by default
Date: 2026-07-03
Repository: `/home/ssf/Documents/Github/allegro`

## Intent Preservation Chain

- Vision: Allegro-origin shipment observations can update fulfillment visibility without raw marketplace payloads or ambiguous order joins.
- Goal Impact: Warehouse can register a durable correlation between sanitized Allegro shipment snapshot identities and the central Orders fulfillment order before consuming status snapshots.
- System: `allegro-service` owns the provider read boundary and hashed snapshot identity; Warehouse owns fulfillment correlation, status ledger, and future fulfillment transitions; Orders owns central lifecycle and paid handoff.
- Feature: disabled-by-default Warehouse shipment correlation producer client.
- Task: build a source-only client that maps `allegro.shipment_status_snapshot.v1` to `POST /api/fulfillment-orders/order/:orderId/provider-shipment-correlations`.
- Execution Plan: reuse the sanitized shipment snapshot mapper; compute the same `sourceReferenceHash` as Warehouse resolver; post only hashed identities; keep runtime disabled unless `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true` and Warehouse config/token are present.
- Coding Prompt: no live Warehouse call, no deploy, no migration, no raw Allegro ids, no buyer/contact/address/tracking URL data, and no fulfillment status mutation.
- Code: `services/allegro-service/src/allegro/shipments/warehouse-shipment-correlation.client.ts`, `warehouse-shipment-correlation.client.spec.ts`, module provider registration, and `verify:warehouse-shipment-correlation`.
- Validation: `npm run verify:warehouse-shipment-correlation`, `npm run verify:shipment-status-snapshot`, `npm run build`, and `git diff --check`.

## Runtime Contract

Producer gate:

- `ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED` must be exactly `true`.
- Warehouse base URL comes from `WAREHOUSE_SERVICE_URL`, defaulting to `http://warehouse-microservice:3201`.
- Missing token/config returns a blocked result and does not call Warehouse.

Warehouse request:

```text
POST /api/fulfillment-orders/order/:centralOrderId/provider-shipment-correlations
```

Payload fields:

- `provider=allegro`
- `sourceChannel=shipment-status-snapshot`
- `accountIdHash`
- `externalOrderIdHash`
- `shipmentIdHash`
- `waybillIdHash`
- `sourceReferenceHash`
- `reasonCode=ALLEGRO_SHIPMENT_CORRELATION_APPROVED`
- `reference=<shipment snapshot idempotency key>`

Sensitive fields intentionally absent:

- raw Allegro checkout-form id;
- raw shipment id;
- raw waybill/tracking number;
- tracking URL;
- buyer/customer email/name/phone;
- delivery address;
- provider raw payload;
- OAuth/internal tokens in payload.

## Parallel Execution Notes

- Ready now: Warehouse deploy/migration owner can deploy the correlation table and endpoint after approval.
- Ready now: Allegro runtime owner can wire `WarehouseShipmentCorrelationClient.publishSnapshotCorrelation()` into the approved shipment projection replay/consumer after deploy approval.
- Dependency-gated: Warehouse status snapshot adapter runtime consumption should wait until correlations exist for the same source reference hash.
- Final integration: Orders orchestrator should consume the Allegro commit as producer evidence and keep deployment/runtime gates explicit.

## Remaining Gates

- `[MISSING: owner approval to deploy Allegro source with ALLEGRO_WAREHOUSE_SHIPMENT_CORRELATION_ENABLED=true]`
- `[MISSING: Warehouse migration/deploy approval for fulfillment_provider_shipment_correlations]`
- `[MISSING: approved Allegro shipment projection/replay runtime caller that invokes the disabled-by-default client]`
- `[MISSING: retention/retry/DLQ policy for failed correlation posts]`
