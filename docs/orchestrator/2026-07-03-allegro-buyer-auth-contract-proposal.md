# Allegro Buyer Auth Contract Proposal

Date: 2026-07-03
Worker: Orders orchestrator Workstream A
Repository: `/home/ssf/Documents/Github/allegro`
Branch: `codex/allegro-buyer-auth-contract`

## Intent Preservation Chain

Vision: Allegro must preserve Orders as the canonical lifecycle source and must not expose order data to a user unless ownership is proven.

Goal Impact: a future buyer order cabinet can show central Orders lifecycle safely only after Auth identity and Allegro buyer identity are explicitly bound.

System: Auth owns human identity, credentials, JWT subject, profile/contact data, delivery address book, and invoice profile wallet. Allegro owns marketplace-local order projection and seller/operator workspace. Orders owns canonical order lifecycle and immutable order snapshots.

Feature: buyer Auth/session contract for an Allegro personal order cabinet.

Task: define the minimum product/Auth contract required before Allegro can add buyer-scoped order APIs or UI.

Execution Plan: use existing hosted Auth and Auth profile contracts; do not back-write marketplace buyer data into Auth; do not infer order ownership from email alone; add buyer cabinet only after explicit product and ownership approval.

Coding Prompt: keep this documentation-only. Do not implement buyer endpoints, UI, DB migrations, deploys, or shared Orders/Warehouse changes in this workstream.

Code: contract proposal started as documentation-only; approved follow-up source now adds `buyerAuthSubject`, buyer list/detail APIs, buyer-safe DTOs, and `/cabinet/orders`.

Validation: source documents and service code inspected remotely; validation commands are recorded below.

## Source-Backed Auth Facts

Auth supports these primitives today:

- Hosted login/register redirect with `client_id`, `return_url`, and `state` through `docs/HOSTED_AUTH_CONSUMER_STANDARD.md`.
- Auth-issued JWTs with `sub`, `email`, `type`, and `roles` per `docs/UNIFIED_AUTH_CONTRACT.md`.
- Backend token validation through `POST /auth/validate` or approved local JWT verification.
- Canonical authenticated profile read through `GET /auth/profile`.
- Auth-owned checkout-data wallet through `GET /auth/profile/checkout-data`, including delivery addresses and invoice profiles, scoped to the bearer subject.
- Auth profile and wallet entries are reusable user truth, while Orders stores immutable order snapshots.

Auth does not currently provide a source-backed claim that an Auth subject owns an imported Allegro marketplace buyer identity.

## Allegro Source Facts

Allegro currently has:

- Seller/operator dashboard route: `/dashboard/orders`.
- Protected API routes: `GET /api/allegro/orders`, `GET /api/allegro/orders/statistics`, and `GET /api/allegro/orders/:id`.
- Orders lifecycle projection in `centralOrderReadModel`, sourced from Orders via latest forwarding attempt.
- Local order buyer fields in `AllegroOrder`: `buyerId`, `buyerEmail`, and `buyerLogin`.
- Auth-linked seller workspace fields in `AllegroAccount.userId` and `UserSettings.userId`.

Allegro does not currently have:

- A buyer cabinet route separate from the seller/operator dashboard.
- A persisted `authUserId` or Auth subject binding on `AllegroOrder`.
- A verified ownership join between Auth `sub`/profile and Allegro `buyerId`, `buyerEmail`, or `buyerLogin`.
- A buyer-safe order DTO that excludes seller/operator-only forwarding diagnostics.

## Contract Decision Required

Workstream A cannot approve implementation alone. The orchestrator/product owner must choose one of these contracts:

### Option 1 - No Buyer Cabinet For Allegro Now

Status: safest current decision.

Decision: keep Allegro as a seller/operator channel publishing and order operations workspace. Do not add buyer self-service order cabinet.

Required follow-up: rename ambiguous docs where possible from "customer cabinet" to "seller/operator order dashboard" for Allegro.

Result: no runtime change required. `/dashboard/orders` continues polling central Orders lifecycle for operators/sellers.

### Option 2 - Buyer Cabinet With Explicit Auth Subject Binding

Status: approved by product/Auth/security owner on 2026-07-03 via orchestrator instruction: `Approved. Option2`.

Decision: introduce a real buyer cabinet only for orders that contain or can derive an approved Auth subject binding. Marketplace-imported Allegro rows without that binding remain hidden from buyer APIs.

Required identity rule:

- `AllegroOrder.authUserId` or an equivalent `Order.customer.authSubject` snapshot must equal the Auth bearer subject.
- Email may be used only as a secondary display or recovery signal, not as the sole ownership proof, unless an explicit verified-email matching policy is approved.
- Guest or imported marketplace orders without Auth binding must not appear in the buyer cabinet.

Required route/API shape:

- Buyer route: `/cabinet/orders`.
- Buyer list API: `GET /api/allegro/buyer/orders`.
- Buyer detail API: `GET /api/allegro/buyer/orders/:id`.
- Both endpoints must use Auth bearer identity and apply ownership filtering before returning rows.
- Cross-buyer access returns 404 to avoid confirming another buyer's order exists.

Required buyer-safe DTO:

- Allowed: order id/display id, ordered date, total/currency, item summary, central lifecycle label, payment status label, fulfillment/delivery label, tracking status when approved.
- Forbidden by default: raw Allegro payload, buyer email/login as proof, forwarding attempt internals, blocked reasons with internal dependency names, raw Orders response, addresses, tokens, provider payloads, warehouse reservation internals, admin audit records.

Required tests:

- Buyer A sees only Buyer A owned orders.
- Buyer A cannot read Buyer B order detail.
- Seller/operator `/dashboard/orders` behavior is unchanged.
- Unauthenticated buyer APIs return 401.
- Orders lifecycle unavailable state degrades to a buyer-safe generic label.

### Option 3 - Verified Email Matching Fallback

Status: not recommended without explicit risk acceptance.

Decision: Auth verified email may match `AllegroOrder.buyerEmail` when no stronger buyer id exists.

Required approval:

- `[MISSING: owner acceptance of email-match account-takeover/privacy risk]`.
- `[MISSING: policy for changed Allegro buyer email, guest checkout, aliases, shared inboxes, and marketplace-masked emails]`.

Required controls:

- Only Auth-verified primary email can match.
- Never expose orders with masked marketplace email formats unless Auth can prove that exact masked address belongs to the user.
- Store a durable ownership audit record before first display.

Result: should remain blocked unless product/legal owner explicitly accepts the risk.

## Recommended Decision

Choose Option 1 now, or Option 2 if a real buyer cabinet is a product requirement.

Do not choose Option 3 as an engineering default. Email-only matching is not a safe ownership contract for marketplace-imported orders without explicit product/legal acceptance.

## Approved Contract Defaults

The approved Option 2 runtime contract is:

- Ownership proof: `AllegroOrder.authUserId`/`buyerAuthSubject` or an equivalent central Orders `customer.authSubject`/`customer.authUserId` snapshot must equal the Auth bearer `sub`.
- No email-only authorization: `buyerEmail` can be displayed only when already authorized by subject binding and should not be used as ownership proof.
- No guest/imported leakage: marketplace-imported orders without Auth subject binding are omitted from buyer list APIs and return 404 on buyer detail APIs.
- Buyer route/API: `/cabinet/orders`, `GET /api/allegro/buyer/orders`, and `GET /api/allegro/buyer/orders/:id`.
- Buyer DTO: order display id, date, total/currency, item summary, buyer-safe central lifecycle/payment/fulfillment labels, and approved tracking status only. Exclude raw payloads, addresses, forwarding diagnostics, provider payloads, warehouse internals, admin audit records, and token or secret material.
- Seller/operator `/dashboard/orders` remains unchanged and keeps workspace ownership semantics.

## Agent-Ready Implementation Prompt After Approval

Use only after Option 2 is approved:

```text
You are the Allegro Buyer Cabinet API/UI worker. Preserve Orders as canonical lifecycle source. Implement buyer-scoped read-only order list/detail using the approved Auth subject binding contract. Do not alter Orders/Warehouse/Notifications contracts. Do not expose raw buyer PII, raw marketplace payloads, forwarding attempt internals, or admin diagnostics. Keep seller/operator /dashboard/orders unchanged. Add focused tests proving buyer isolation and central lifecycle projection.
```

## Remaining Blockers

- Source implementation present for `buyerAuthSubject`; runtime remains `[MISSING: approved DB migration/deploy]`.
- `[MISSING: migration/backfill decision for historical Allegro rows; default is no backfill and no buyer visibility without Auth subject binding]`.
- Buyer-safe DTO and source isolation tests are present; `[MISSING: live authenticated buyer smoke after deploy]`.

## Validation Commands

```bash
ssh alfares 'cd /home/ssf/Documents/Github/allegro && git status --short --branch && git log -1 --oneline'
# Confirmed clean source before creating isolated worktree; base commit b5f855a.

ssh alfares 'cd /home/ssf/Documents/Github/auth-microservice && sed -n "1,240p" docs/HOSTED_AUTH_CONSUMER_STANDARD.md && sed -n "1,240p" docs/UNIFIED_AUTH_CONTRACT.md && sed -n "1,220p" docs/AUTH_CUSTOMER_DATA_WALLET_CONTRACT.md'
# Confirmed hosted Auth, JWT/profile, and Auth wallet ownership contracts.

ssh alfares 'cd /home/ssf/Documents/Github/allegro && rg -n "buyer-facing Allegro personal cabinet|buyer Auth/session contract|buyer order ownership|buyer|customer|roles|userType" docs 10_features 11_tasks 21_execution_plans 22_goal_impact services/frontend/src shared/auth services/allegro-service/src/allegro/orders --glob "!node_modules" --glob "!dist"'
# Confirmed existing dashboard/order surface and missing buyer ownership contract markers.
```
