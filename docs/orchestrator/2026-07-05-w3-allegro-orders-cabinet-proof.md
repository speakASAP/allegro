# W3 Allegro Orders Cabinet Proof

status: source_proven_runtime_auth_gated
created_at: 2026-07-05
workstream: W3 Allegro buyer/admin cabinet smoke
master_plan: /home/ssf/Documents/Github/orders-microservice/docs/orchestrator/2026-07-05-error-free-orders-lifecycle-master-plan.md
repo_handoff: /home/ssf/Documents/Github/allegro/docs/orchestrator/2026-07-05-error-free-orders-lifecycle-handoff.md

## Intent Preservation Chain

Vision -> Every Allegro buyer/admin order cabinet reflects the canonical Orders lifecycle instead of local marketplace lifecycle drift.

Goal Impact -> Buyers and admins can refresh order state from the central Orders lifecycle read model while Allegro remains only the channel UI/projection owner.

System -> Orders owns central lifecycle stages and read models; Warehouse owns fulfillment/delivery status; Allegro owns buyer/admin UI surfaces and channel-safe DTO/client integration only.

Feature -> Allegro `/cabinet/orders` buyer cabinet and `/dashboard/orders` admin/operator order view show central lifecycle state and expose refresh behavior.

Task -> Prove the Allegro buyer/admin order cabinet source reads central Orders lifecycle and refreshes status, then record live-smoke blockers if no approved bearer/session exists.

Execution Plan -> Run the existing `verify:orders-lifecycle-ui` verifier, inspect source markers for central lifecycle read model and refresh behavior, run unauthenticated public/API status smoke, and do not perform provider writes, raw payload reads, token output, deploy, or unsafe ownership fallback.

Coding Prompt -> Allowed files are Allegro frontend/order client/verifier docs/reports only; forbidden are Auth.email ownership fallback, raw Allegro/customer/provider/token output, provider writes, and deploy without a later gate.

Code -> No code changes. Existing verifier checks `services/frontend/src/pages/OrdersPage.tsx` and `services/frontend/src/pages/BuyerOrdersPage.tsx`.

Validation -> Source verifier passed; unauthenticated live route/API status smoke passed for shell access and auth enforcement; live buyer/admin data smoke remains gated on approved bearer/session packets.

## Evidence

Repository state before report: `/home/ssf/Documents/Github/allegro`, branch `main`, head `6d3f3a8 docs: plan error-free orders lifecycle`, `main...origin/main [ahead 1]`, no uncommitted changes.

Required verifier:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/allegro && npm run verify:orders-lifecycle-ui'
```

Result:

```json
{"success":true,"filesChecked":2,"lifecycleStagesCoveredPerFile":13,"refreshCoverage":"manual and polling refresh visible in customer/admin order pages"}
```

Source markers checked:

- Admin/operator view: `services/frontend/src/pages/OrdersPage.tsx` reads `/allegro/orders`, `/allegro/orders/statistics`, renders `centralOrderReadModel`, maps all central lifecycle stages, shows manual `Refresh`, shows `Refreshing central lifecycle...`, and refreshes visible pages every 30000 ms plus `visibilitychange`.
- Buyer view: `services/frontend/src/pages/BuyerOrdersPage.tsx` reads `/allegro/buyer/orders`, renders `centralOrderReadModel`, maps all central lifecycle stages, shows manual `Refresh`, shows `Refreshing central lifecycle...`, and refreshes visible pages every 30000 ms plus `visibilitychange`.
- Buyer ownership remains subject-bound through the existing buyer API contract; this proof does not use or add `Auth.email == buyerEmail` authorization.

Unauthenticated live status smoke:

```text
https://allegro.alfares.cz/cabinet/orders 200
https://allegro.alfares.cz/dashboard/orders 200
https://allegro.alfares.cz/api/allegro/buyer/orders 401
https://allegro.alfares.cz/api/allegro/orders 401
```

Diff sanity:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/allegro && git diff --check'
# passed with no output
```


## Approved Live Buyer Smoke

Owner approval was provided on 2026-07-05. The smoke used a temporary short-lived bearer file and one synthetic `codex-real-buyer-smoke-%` order bound by `buyerAuthSubject`; no token, raw subject, raw order id, customer payload, provider payload, tracking number, or tracking URL was printed.

```text
root_status=200
cabinet_status=200
unauth_status=401
buyer_list_status=200
buyer_items=1
buyer_total=1
buyer_detail_status=200
missing_detail_status=404
raw_token_printed=false
raw_order_id_printed=false
raw_customer_payload_printed=false
cleanup_deleted=1
post_cleanup_fixture_count=0
```

## Runtime Blockers

- `[PROVEN: approved live buyer bearer/session packet ran /api/allegro/buyer/orders list/detail smoke without printing token values.]`
- `[MISSING: approved live admin bearer/session packet for /api/allegro/orders and /api/allegro/orders/statistics smoke without printing token values.]`
- `[PROVEN: live synthetic subject-bound buyer order row was visible to the approved buyer bearer and cleaned up.]`
- `[MISSING: live subject-bound buyer order row with forwarded central Orders lifecycle visible to the approved buyer bearer from real traffic.]`
- `[MISSING: live admin-visible forwarded Allegro order sample for sanitized lifecycle refresh readback, if not covered by the approved admin bearer packet.]`

## Handoff

W3 is source-proven and buyer-runtime-proven for the approved synthetic subject-bound row. Do not broaden ownership by email, do not use raw Allegro payloads or raw buyer/customer data, and do not deploy for this proof. Remaining runtime work is limited to an approved admin bearer/session smoke and future real-traffic forwarded lifecycle evidence.
