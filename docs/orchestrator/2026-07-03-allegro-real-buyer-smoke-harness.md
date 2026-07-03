# Allegro Real Buyer Cabinet Smoke Harness

Date: 2026-07-03
Status: source-prepared, approval-gated

## IPS Chain

- Vision: Allegro buyer cabinets must show only orders explicitly bound to the authenticated Auth subject.
- Goal Impact: once a subject-bound row exists, the live buyer list/detail smoke can be run without ad hoc token or response logging.
- System: Auth owns user identity and bearer tokens; Allegro owns buyer-safe order projection and `/cabinet/orders`; Orders owns canonical lifecycle; Warehouse owns fulfillment state.
- Feature: approval-gated real buyer cabinet smoke harness.
- Task: add a reusable non-mutating smoke script for `GET /api/allegro/buyer/orders` and `GET /api/allegro/buyer/orders/:id`.
- Execution Plan: default to source-only mode; require explicit env confirmation and a caller-supplied buyer bearer for live execution; print only statuses, counts, booleans, and short hashes.
- Coding Prompt: do not print tokens, raw order ids, customer payloads, provider payloads, addresses, tracking numbers, or tracking URLs.
- Code: `scripts/smoke-allegro-real-buyer-cabinet.js` and package script `smoke:real-buyer-cabinet`.
- Validation: node syntax check plus default source-only script execution.

## Default Mode

```bash
npm run smoke:real-buyer-cabinet
```

Expected result:

- `status=approval_required_no_live_call`
- no live Auth, Allegro, Orders, Warehouse, provider, DB, or mutation call.

## Approved Live Mode

Run only after the Orders approval packet has one of these owner approvals:

1. Existing Allegro row binding to the approved Auth subject.
2. Synthetic subject-bound Allegro fixture row.
3. Natural authenticated order creation that writes `buyerAuthSubject`.

Required environment:

- `RUN_ALLEGRO_REAL_BUYER_SMOKE=1`
- `ALLEGRO_BUYER_SMOKE_CONFIRM=READ_ONLY_REAL_BUYER_CABINET`
- `ALLEGRO_BUYER_SMOKE_BEARER_TOKEN` or `ALLEGRO_BUYER_SMOKE_TOKEN_FILE`
- optional `ALLEGRO_BUYER_SMOKE_BASE_URL`, default `https://allegro.alfares.cz`
- optional `ALLEGRO_BUYER_SMOKE_MIN_ORDERS`, default `1`

The script verifies:

- `/` returns 200.
- `/cabinet/orders` returns 200.
- unauthenticated `GET /api/allegro/buyer/orders` returns 401.
- authenticated buyer list returns 200 and at least the approved minimum count.
- first returned buyer order detail returns 200.
- non-owned/missing detail returns 404.

The script prints only sanitized evidence and rejects responses containing known forbidden markers for tokens, buyer email, delivery address, tracking numbers, tracking URLs, or waybills.

## Remaining Gates

- `[MISSING: approved subject-bound Allegro order row for the real buyer smoke.]`
- `[MISSING: approved Auth-valid buyer bearer acquisition path that does not print token values.]`
- `[MISSING: real forwarded Orders lifecycle display smoke if the approved row has no central Orders forwarding.]`
- `[BLOCKED: provider/courier runtime remains contract-gated by missing owner/contract/credentials/mapping/tracking visibility policy.]`

Next step: approve a subject-bound row option, then run the harness in approved live mode and record sanitized evidence.
