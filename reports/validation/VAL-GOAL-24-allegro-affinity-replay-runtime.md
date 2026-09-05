# VAL-GOAL-24 Allegro Affinity Replay Runtime

Date: 2026-07-03
Repository: `/home/ssf/Documents/Github/allegro`
Commit: `2c72f6b fix: scope allegro order reads by workspace`

## IPS Chain

Vision -> marketplace purchase history can improve related-product evidence without leaking buyer/address/payment/provider data.
Goal Impact -> Allegro now has a live protected replay source for paid multi-Catalog-product orders.
System -> Allegro owns local order projection and protected replay producer; Marketing/Catalog own aggregation and persistence.
Feature -> `GET /internal/allegro/order-affinity/replay-candidates`.
Task -> deploy merged producer and run aggregate-only protected endpoint validation.
Execution Plan -> deploy producer first, print only non-sensitive aggregate metadata, do not mutate Orders/Warehouse/Payments/Catalog.
Coding Prompt -> use pod-local token from env without printing values and emit only count/contract/channel/skipped totals.
Code -> deployed with `./scripts/deploy.sh`; live image tag `2c72f6b` includes Goal 24 merge `40e7f0e`.
Validation -> protected endpoint smoke returned HTTP 200 and bounded aggregate envelope metadata.
State Update -> producer runtime is live; Marketing replay remains blocked until token mapping exists.

## Validation Evidence

- `git merge-base --is-ancestor 40e7f0e HEAD` returned `0`, confirming deployed `2c72f6b` contains the Goal 24 replay merge.
- `kubectl -n statex-apps rollout status deploy/allegro-service --timeout=180s` passed.
- `kubectl -n statex-apps get deploy allegro-service -o wide` showed image `localhost:5000/allegro-service:2c72f6b`, `1/1` ready.
- Aggregate-only smoke output:

```json
{
  "tokenPresent": true,
  "status": 200,
  "success": true,
  "contract": "marketplace.order_affinity_candidate.v1",
  "channel": "allegro",
  "count": 8,
  "skippedRecords": 92,
  "eventSampleCount": 8
}
```

## Privacy Boundary

No customer, address, payment, provider, raw marketplace order id, token value, or raw event payload was printed in validation evidence.

## Blockers
