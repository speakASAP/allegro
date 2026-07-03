# Allegro Checkout-Form Fulfillment Fixture Contract

```yaml
id: ALG-CHECKOUT-FORM-FULFILLMENT-FIXTURES
status: runtime-aggregates-probed-source-contract
owner: allegro-provider-owner
created: 2026-07-03
last_updated: 2026-07-03
completeness_level: partial
upstream:
  - docs/orchestrator/ALLEGRO_IMPORT_EXPORT_MAPPING.md
  - docs/orchestrator/2026-07-03-allegro-shipment-status-source-contract.md
  - warehouse-microservice/docs/contracts/allegro-checkout-fulfillment-status-mapping.md
downstream:
  - Warehouse checkout-form fulfillment mapping
  - Orders source-reference preservation verification
```

## Intent Chain

- Vision: Allegro checkout-form status evidence can inform Warehouse/Orders lifecycle work without leaking raw marketplace payloads or confusing seller readiness with carrier movement.
- Goal Impact: Warehouse now has sanitized enum fixtures and timestamp-shape evidence for the checkout-form mapping gate, while runtime Warehouse adapter work remains blocked.
- System: Allegro owns checkout-form polling, raw payloads, enum observation, and source interpretation; Warehouse owns fulfillment-order transitions; Orders owns central lifecycle and paid handoff.
- Feature: sanitized checkout-form fulfillment enum fixtures.
- Task: record production aggregate enum/status/timestamp evidence from the local Allegro order projection without printing raw order ids, buyer fields, addresses, raw payloads, tracking numbers, tokens, or provider payloads.
- Execution Plan: run a read-only in-pod aggregate probe against the local Allegro projection and document only counts, enum names, timestamp shapes, hashes, and blockers.
- Coding Prompt: no provider writes, no DB mutation, no raw payload output, no customer data, no tracking values, no Warehouse/Orders edits.
- Code: documentation only.
- Validation: sanitized probe output, `git diff --check`, and pre-commit.

## Runtime Aggregate Probe

Probe: `allegro.checkout_form_enum_fixture_probe.v1`

Runtime target: live `allegro-service` pod in `statex-apps`.

Scope:

- local `AllegroOrder` projection only;
- latest 117 projected checkout-form rows;
- aggregate counts and timestamp-shape classification only;
- no raw checkout-form ids, buyer data, delivery addresses, raw payloads, tracking values, tokens, or provider response bodies printed.

Result:

```json
{
  "sampledRows": 117,
  "statusHistogram": {
    "READY_FOR_PROCESSING": 103,
    "CANCELLED": 14
  },
  "paymentStatusHistogram": {
    "PAID": 112,
    "[NULL]": 5
  },
  "fulfillmentStatusHistogram": {
    "PICKED_UP": 61,
    "CANCELLED": 22,
    "SENT": 32,
    "RETURNED": 2
  },
  "marketplaceHistogram": {
    "allegro-cz": 116,
    "allegro-sk": 1
  },
  "ordersWithLineItems": 117,
  "multiLineOrders": 8,
  "totalLineItems": 125,
  "trackingNumberPresent": 0,
  "rawDataPresent": 117,
  "rawShipmentFieldsPresent": 0,
  "ordersWithForwardedCentralId": 0
}
```

Timestamp shape evidence:

| Field | Shape result |
| --- | --- |
| `orderDate` | 117 iso-like |
| `paidAt` | 112 iso-like, 5 absent |
| `updatedAt` | 117 iso-like |
| raw `createdAt` | 117 absent |
| raw `updatedAt` | 117 iso-like |
| raw `payment.finishedAt` | 112 iso-like, 5 absent |

Hashed sample evidence:

| Sample | Local order hash | External checkout-form hash |
| --- | --- | --- |
| 1 | `sha256:fd3e4cc27349c36d1c1cdbf6ddeb310b26950ffeedd276ba0095e086123c3dc0` | `sha256:cf0e5b70939a18a0dc0feba5f01dd23f295ce0c79747c2cab310dd0cb801cb9f` |
| 2 | `sha256:a2d20b6f8708e712689c1c4c1bdc194f142135472913c6ed5307fe8d6141096f` | `sha256:193b9f75066c92f0f235476bcd42debb74822cc2c7e9ccfa4b01400bc03e487e` |
| 3 | `sha256:4a6178cb426582bc781019786fdd72e1a503b45e27a8c64ecfac3ee1148b38e1` | `sha256:8df3bf5f376a60c6edf72a8ab2a305b571368c7386105581a7775609a278665b` |

## Fixture Classes

| Fixture class | Observed evidence | Warehouse mapping implication |
| --- | --- | --- |
| paid ready checkout | `status=READY_FOR_PROCESSING`, `paymentStatus=PAID` | eligible for Orders paid-handoff consideration only; not a Warehouse status by itself |
| unpaid or incomplete payment | `paymentStatus=[NULL]` | not eligible for paid handoff |
| seller sent | `fulfillmentStatus=SENT` | candidate for `handed_to_delivery` only after Orders/Warehouse join and transition gates |
| picked up | `fulfillmentStatus=PICKED_UP` | delivery-like value; must not bypass carrier snapshot contract or Warehouse transition graph |
| returned/cancelled | `fulfillmentStatus=RETURNED|CANCELLED` or `status=CANCELLED` | no direct stock or fulfillment mutation; requires Orders lifecycle decision |
| no tracking in projection | `trackingNumberPresent=0`, `rawShipmentFieldsPresent=0` | do not use local `AllegroOrder.trackingNumber` or raw checkout form as delivery proof |

## Sensitive Data Policy

Allowed in this fixture:

- enum names;
- aggregate counts;
- timestamp-shape classes;
- SHA-256 hashes of local/external ids;
- missing-gate markers.

Forbidden:

- raw checkout-form ids;
- buyer id, email, login, phone, name, address, delivery point details;
- raw `rawData` payloads;
- tracking numbers, waybills, tracking URLs;
- OAuth tokens, Authorization headers, cookies, Kubernetes secret values;
- raw provider responses or payload bodies.

## Remaining Gates

- `[MISSING: Orders source-reference preservation evidence; sampled local projection has zero forwarded central Orders ids.]`
- `[MISSING: approved Warehouse durable adapter ledger for checkout-form status observations.]`
- `[MISSING: approved timestamp ordering/replay semantics across Allegro updatedAt, local observation time, and Warehouse transition occurredAt.]`
- `[MISSING: owner approval before Warehouse runtime adapter, Allegro projection migration, deployment, or production fulfillment-row mutation.]`

## Handoff Notes

For Warehouse:

- Use `SENT` only as a candidate `handed_to_delivery` hint after a valid central Orders id, fulfilled reservations, and existing Warehouse fulfillment order are proven.
- Treat `PICKED_UP`, `RETURNED`, and `CANCELLED` as evidence requiring explicit mapping decisions; do not directly mutate Warehouse from these values.
- Keep carrier movement in the sanitized shipment snapshot contract, not the checkout-form enum mapping.

For Orders:

- The next gate is source-reference preservation: prove Allegro-origin central Orders and Warehouse handoff records preserve enough source evidence and fulfilled reservation ids to join safely without raw provider payloads.
- Until that proof exists, Warehouse must not consume checkout-form status observations as runtime fulfillment status updates.
