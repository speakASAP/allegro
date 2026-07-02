# Allegro Buyer Auth Ownership Contract Audit

Date: 2026-07-03
Repository: `/home/ssf/Documents/Github/allegro`
Related plan: `docs/orchestrator/2026-07-03-buyer-order-cabinet-gap-plan.md`

## Intent Preservation Chain

Vision: a buyer-facing Allegro order cabinet must show only orders owned by the authenticated buyer while preserving Orders as the canonical lifecycle source.

Goal Impact: current evidence confirms Auth can identify a signed-in user, but Allegro still lacks an approved ownership rule that maps that user to marketplace buyer rows.

System: Auth owns user identity, email, profile, checkout wallet data, JWTs, and RBAC roles. Allegro owns marketplace seller workspace data and imported Allegro order snapshots. Orders owns canonical order lifecycle projection.

Feature: buyer Auth/order ownership contract for a future Allegro personal order cabinet.

Task: verify whether current Auth and Allegro source already provide enough information to safely scope buyer order reads.

Execution Plan: inspect Auth contract and Allegro source read-only; do not create buyer routes until ownership is proven; record the exact implementable contract and blockers.

Coding Prompt: do not equate Auth `email` with Allegro `buyerEmail` unless product/Auth/marketplace policy explicitly approves it; do not expose the existing seller `/dashboard/orders` table as a buyer cabinet.

Code: documentation only in this slice.

Validation: remote source inspection and `git diff --check` for this documentation update.

## Current Auth Evidence

Auth source of truth provides these relevant capabilities:

- `docs/UNIFIED_AUTH_CONTRACT.md` states Auth owns identity, JWTs, profile, delivery addresses, invoice profiles, RBAC, and registered-user preferences.
- Auth JWT payload includes `sub`, `email`, `roles`, and standard expiry fields.
- `POST /auth/validate` returns the current Auth user and Auth-owned roles.
- `GET /auth/profile` returns sanitized canonical Auth profile fields such as `email`, `firstName`, `lastName`, `phone`, and contact metadata.
- `GET /auth/profile/checkout-data` returns Auth-owned reusable customer profile/address/invoice wallet data for checkout prefill.
- Auth delivery-address and invoice-profile endpoints are scoped to the bearer subject.

This proves Auth can identify an authenticated ecosystem user and their primary email/contact profile. It does not by itself prove that the user owns an Allegro marketplace order row.

## Current Allegro Evidence

Allegro source currently has two separate identity domains:

- Workspace/seller identity:
  - `AllegroAccount.userId` links a seller/workspace account to an Auth user id.
  - `UserSettings.userId` links workspace settings/access to an Auth user id.
  - `/allegro/users/register-access` records `allegroWorkspaceRegisteredAt` for the authenticated user.
  - `/dashboard/orders` is part of the authenticated seller/workspace dashboard.

- Marketplace buyer snapshot identity:
  - `AllegroOrder.buyerId`, `buyerEmail`, and `buyerLogin` come from Allegro checkout-form data.
  - `AllegroOrder` has no `authUserId`, `authSubject`, `buyerAuthUserId`, or verified ownership relation.
  - `OrdersController.getOrders()` currently accepts query only and does not pass `req.user` to `OrdersService.getOrders()`.
  - `OrdersService.getOrders()` filters by operational query values, not by Auth user or buyer ownership.

Therefore the current source cannot safely create a buyer-scoped order cabinet without a new ownership contract.

## Explicit Non-Decision

Do not use `Auth.email == AllegroOrder.buyerEmail` as a production authorization rule yet.

That mapping is plausible for some storefronts, but it is not approved here because:

- Allegro buyer email values may be marketplace-provided, masked, changed, or not the same address used for Alfares Auth.
- Email can be mutable profile data, while order ownership needs stable proof.
- The existing seller dashboard intentionally displays buyer email to operators; reusing it for buyers would leak other buyers unless backend filtering is proven first.
- No test fixture currently proves buyer A cannot see buyer B orders.

## Minimal Approved Contract Needed For Runtime Work

A future implementation can proceed when one of these ownership contracts is approved:

1. Stable Auth subject snapshot on order ingestion:
   - Add a bounded field such as `buyerAuthUserId` or `buyerAuthSubject` to the Allegro order projection only when the buyer authenticated through Alfares Auth during checkout or account linking.
   - Buyer endpoints filter by `req.user.id/sub == buyerAuthUserId`.

2. Verified buyer-link table:
   - Add an explicit mapping between Auth user id and Allegro buyer id/login after an approved verification/linking flow.
   - Buyer endpoints filter by the verified mapping, not raw email alone.

3. Approved email-match fallback:
   - Only if product/Auth/security owners explicitly approve it, normalize verified Auth email and Allegro buyer email into a separate verified ownership field at ingestion or linking time.
   - The API must still use a persisted verified ownership field or audited resolver, not ad hoc UI filtering.

## Agent-Ready Runtime Plan After Approval

### Workstream A - Ownership Contract

Status: blocked.

Allowed files: Allegro/Auth contract docs, IPS docs, product approval artifacts.

Output: one approved ownership rule and field-level buyer-safe response contract.

Validation: source contract reference resolving the `[MISSING]` items below.

### Workstream B - Buyer API

Status: dependency-gated by Workstream A.

Allowed files: `services/allegro-service/src/allegro/orders/**`, focused tests.

Implementation shape:

- Add buyer-scoped read-only list/detail endpoints separate from `/allegro/orders`, for example `/allegro/buyer/orders`.
- Use `JwtAuthGuard` and pass `req.user` into the service.
- Filter at the database/service layer by the approved ownership field or verified mapping before selecting order rows.
- Return a buyer-safe DTO: order id, order date, item summary, total, delivery status, and `centralOrderReadModel`; exclude raw forwarding attempts, rawData, internal blocked reasons, seller account data, and other buyers' identifiers.

Validation:

- Tests with buyer A, buyer B, and seller/admin prove isolation.
- Existing seller `/allegro/orders` behavior remains unchanged unless a separate admin/workspace hardening goal changes it.

### Workstream C - Buyer UI

Status: dependency-gated by Workstreams A and B.

Allowed files: `services/frontend/src/**` buyer route/components.

Implementation shape:

- Add a product-approved buyer route such as `/cabinet/orders`.
- Poll the buyer-safe API for lifecycle changes.
- Display Orders lifecycle projection as canonical status.

Validation: frontend build and route smoke without live customer data dumps.

## Remaining Blockers

- `[MISSING: buyer-facing Allegro personal cabinet product requirement.]`
- `[MISSING: approved Auth-to-Allegro-buyer ownership rule.]`
- `[MISSING: stable persisted ownership field or verified buyer-link mapping.]`
- `[MISSING: buyer-safe API response contract.]`
- `[MISSING: tests proving buyer A cannot see buyer B orders and seller workspace remains unchanged.]`

## Current Safe State

- Keep `/dashboard/orders` as the seller/workspace order view.
- Keep its existing central Orders lifecycle polling for operators/sellers.
- Do not expose it as a buyer personal cabinet.
- Start runtime work only after one ownership contract above is approved.
