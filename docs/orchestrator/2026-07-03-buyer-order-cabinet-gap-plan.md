# Allegro Buyer Order Cabinet Gap Plan

Date: 2026-07-03
Worker: Orders orchestrator Worker B
Repository: `/home/ssf/Documents/Github/allegro`

## Intent Preservation Chain

Vision: Allegro forwards received marketplace orders to Orders and must not become the canonical lifecycle owner.

Goal Impact: buyers or customers should only see order lifecycle state when product requirements, Auth identity, and order ownership contracts prove which orders belong to the signed-in person.

System: `allegro-service` currently exposes a registered seller workspace at `https://allegro.alfares.cz/dashboard`, with order read APIs under `/api/allegro/orders` and central Orders lifecycle projection in `centralOrderReadModel`.

Feature: buyer-facing personal order cabinet for Allegro.

Task: inspect whether the current Allegro codebase already has a buyer/customer order cabinet and either wire bounded Orders lifecycle projection into that surface or record the missing contracts without fabricating a portal.

Execution Plan: use read-only discovery first; preserve Orders as canonical lifecycle source; avoid Orders/Warehouse/Notifications/shared-contract edits; implement only if a buyer-owned cabinet and ownership filter already exist.

Coding Prompt: do not create a buyer portal from seller-dashboard evidence alone; mark unavailable product/auth/order ownership facts as `[MISSING: ...]` or `[UNKNOWN: ...]`.

Code: no runtime code changed in this worker because the safe implementation prerequisites are missing.

Validation: remote source inspection, route ownership review, Prisma model review, and read-only cross-marketplace pattern notes below.

## Decision

Blocked. Allegro has an authenticated seller/customer workspace with `/dashboard/orders`, but no verified buyer-facing personal order cabinet.

The existing order dashboard is not safe to treat as a buyer cabinet because it is scoped only by authenticated workspace access and returns all local Allegro order rows selected by the backend query. The row data includes buyer email/login fields and central lifecycle projection. There is no current Auth-to-Allegro-buyer ownership contract that would let the service filter orders to the signed-in buyer.

## Remote Allegro Evidence

Current remote state at inspection time:

- Path: `/home/ssf/Documents/Github/allegro`
- Branch: `main`
- HEAD: `ed0dedd merge: goal25 allegro consumer validation`
- Worktree: clean at first preflight, `## main...origin/main`

Existing seller/workspace routes:

- `services/frontend/src/App.tsx` registers `/dashboard/orders` under `ProtectedRoute`.
- `services/frontend/src/pages/Dashboard.tsx` describes the workspace as `Alfares CZ marketplace workspace`, includes seller account selector/OAuth guidance, and links `Orders` to `/dashboard/orders`.
- `docs/10_features/FEAT-009-public-client-ui.md`, `docs/11_tasks/TASK-009-public-client-landing-dashboard.md`, and `docs/21_execution_plans/EP-TASK-009-public-client-landing-dashboard.md` define the public client UI as a registered seller workspace for Catalog-to-Allegro publishing, OAuth/account readiness, drafts/offers, orders, and settings.

Existing order lifecycle projection:

- `services/frontend/src/pages/OrdersPage.tsx` calls `/allegro/orders` and `/allegro/orders/statistics`, refreshes visible order rows every 30 seconds, and renders `centralOrderReadModel` before Allegro-local snapshot status.
- `services/allegro-service/src/allegro/orders/orders.controller.ts` exposes `GET /allegro/orders`, `GET /allegro/orders/statistics`, and `GET /allegro/orders/:id`, protected by `JwtAuthGuard` only.
- `services/allegro-service/src/allegro/orders/orders.service.ts` joins `AllegroOrder` with latest `AllegroOrderForwardingAttempt`, extracts central Orders id from forwarding response summary, and calls `OrderClientService.getOrderLifecycle(...)` fail-soft.
- `docs/orchestrator/2026-07-02-central-orders-status-read-model-plan.md` and `docs/orchestrator/STATUS.md` record A1/A2 central Orders lifecycle read-model work as implemented for the Allegro order dashboard/cabinet.

Ownership gap evidence:

- `prisma/schema.prisma` `AllegroOrder` has `buyerId`, `buyerEmail`, and `buyerLogin`, but no Auth user id, session subject id, buyer portal account id, or verified ownership join.
- `AllegroAccount` and `UserSettings` have `userId` tied to Auth users, but those are seller/workspace account settings, not Allegro buyer identities.
- `OrdersService.getOrders(query)` builds filters only for `status` and `paymentStatus`; it does not receive `req.user`, `buyerEmail`, `buyerId`, or an ownership scope.
- `OrdersController.getOrders(...)` does not pass `req.user` to the service.
- `OrdersPage.tsx` renders buyer email in the table, which is acceptable for an operator/seller view but unsafe as a buyer self-service route unless row ownership is guaranteed first.


## Follow-Up Auth Ownership Audit

A focused current-state audit was added in `docs/orchestrator/2026-07-03-buyer-auth-ownership-contract-audit.md`.

Conclusion: Auth can identify an authenticated user through `sub` and `email`, but current Allegro source still does not prove that Auth identity owns any `AllegroOrder.buyerId`, `buyerEmail`, or `buyerLogin` row. Runtime buyer-cabinet implementation remains blocked until an approved ownership rule is defined.

## Required Product And Contract Inputs

Implementation is blocked until these are defined and approved:

- `[MISSING: buyer-facing Allegro personal cabinet product requirement]` - whether Allegro should expose a buyer self-service cabinet at all, separate from the seller workspace.
- `[MISSING: buyer Auth/session contract]` - how a signed-in Auth user proves they are the Allegro buyer for `AllegroOrder.buyerId`, `buyerEmail`, or another stable buyer identity.
- `[MISSING: buyer order ownership filter]` - backend rule that filters order list/detail by signed-in buyer identity before returning any row.
- `[MISSING: buyer-safe order API response contract]` - exact fields a buyer may see; current seller table includes buyer identifiers and marketplace/internal status evidence.
- `[MISSING: route and navigation contract]` - whether the route is `/cabinet/orders`, `/orders`, `/dashboard/orders`, or another product-owned surface.
- `[MISSING: central Orders public lifecycle projection contract]` - buyer-safe mapping of Orders lifecycle/payment/warehouse status labels without leaking internal forwarding attempts, blocked reasons, provider payloads, or admin-only diagnostics.
- `[MISSING: tests with two buyers and one seller/admin]` - must prove buyer A cannot see buyer B orders, and seller/admin workspace behavior stays unchanged.

## Agent-Ready Follow-Up Plan

### Workstream A - Product/Auth Contract Owner

Status: blocked.

Objective: define whether Allegro needs a buyer cabinet and how Auth identity maps to Allegro order buyer identity.

Allowed files: product docs, Auth consumer contract docs, Allegro IPS docs.

Forbidden files: runtime code, database migrations, Orders/Warehouse contracts.

Expected output: approved product requirement, route decision, Auth/session ownership mapping, and field-level buyer-safe response contract.

Validation evidence: written approval or source contract reference; `[MISSING]` markers resolved explicitly.

### Workstream B - Allegro Buyer Cabinet API Owner

Status: dependency-gated by Workstream A.

Objective: add buyer-scoped read-only list/detail endpoints that preserve Orders as canonical lifecycle source.

Allowed files: `services/allegro-service/src/allegro/orders/**`, focused tests, Allegro docs.

Forbidden files: Orders/Warehouse/Notifications edits, DB migrations unless separately approved, seller dashboard behavior regressions.

Expected output: buyer-scoped `GET` endpoints with `req.user` ownership filter, buyer-safe DTO, central lifecycle projection, and 403/404 behavior for cross-buyer access.

Validation evidence: focused service/controller specs with two buyers plus seller/admin unchanged.

### Workstream C - Allegro Buyer Cabinet UI Owner

Status: dependency-gated by Workstream A and B.

Objective: add the approved buyer cabinet route and read-only polling UI.

Allowed files: `services/frontend/src/**` buyer-cabinet route/components, focused frontend validation docs.

Forbidden files: seller publish/product flows, Auth internals, shared contracts.

Expected output: buyer order list/detail UI polling the buyer-safe API and showing central Orders lifecycle as canonical state.

Validation evidence: frontend build, route smoke, and UI evidence without raw customer/order payloads.

### Workstream D - Integration And Validation Owner

Status: final integration.

Objective: validate seller dashboard remains unchanged, buyer access is scoped, unauthenticated access is rejected, and Orders lifecycle source remains canonical.

Allowed files: validation docs, targeted tests/scripts.

Forbidden files: production deploy without orchestrator approval, secret/Vault mutation, live buyer data exposure.

Expected output: handoff report with commands, route evidence, and remaining blockers.

Merge order: A contract approval -> B API -> C UI -> D validation/deploy decision.

## Read-Only Cross-Marketplace Notes

The same naming gap appears in adjacent marketplace docs: some plans call surfaces customer/client cabinets, while source evidence often points to seller/operator dashboards.

- Bazos docs explicitly keep `[UNKNOWN: buyer-facing cabinet versus operator-only dashboard surface]` and `[MISSING: provider-backed customer/admin order UI requirements beyond the bounded synthetic/internal read model]` in the central Orders plan/status notes.
- Aukro has protected dashboard order views and customer/admin lifecycle wording, but read-only evidence still shows customer identifiers in order services and UI controller paths; buyer-safe Auth ownership must be rechecked before treating it as a buyer personal cabinet.
- FlipFlop appears to be the strongest true customer-facing checkout/cabinet candidate from docs, but this worker did not edit or validate FlipFlop source.
- Heureka exposes public dashboard shells and protected order APIs; docs describe parity and operator/channel dashboard behavior, not proof of a buyer ownership contract.

No other marketplace repo was edited by this worker.

## Validation Commands

```bash
ssh alfares 'cd /home/ssf/Documents/Github/allegro && git status --short --branch && git branch --show-current && git log -1 --oneline'
# ## main...origin/main
# main
# ed0dedd merge: goal25 allegro consumer validation

ssh alfares 'cd /home/ssf/Documents/Github/allegro && rg -n "buyer|customer|cabinet|orders?|dashboard|personal|account|profile" -S --glob "!node_modules" --glob "!dist" --glob "!build"'
# Found `/dashboard/orders`, seller/workspace docs, OrdersPage, OrdersController, OrdersService; no standalone buyer-owned cabinet contract.

ssh alfares 'cd /home/ssf/Documents/Github/allegro && rg -n "model AllegroOrder|buyerId|buyerEmail|buyerLogin|userId" prisma/schema.prisma -C 4'
# AllegroOrder stores buyer fields; Auth userId exists on AllegroAccount/UserSettings, not as order buyer ownership.

ssh alfares 'for repo in bazos aukro flipflop heureka; do echo "== $repo =="; cd /home/ssf/Documents/Github/$repo && git status --short --branch | sed -n "1p" && (rg -n "dashboard.*orders|orders.*dashboard|/dashboard/orders|OrdersPage|buyer|customer|cabinet|personal cabinet|registered seller|seller workspace" services src frontend app docs 2>/dev/null || true) | sed -n "1,80p"; done'
# Read-only notes summarized above; no writes outside Allegro.
```

## Handoff Notes

Do not implement a buyer portal by reusing `/dashboard/orders` as-is. That route is currently the registered seller workspace order view and should continue to show Orders lifecycle projection for operators/sellers. A buyer-facing cabinet requires an explicit product decision plus Auth-to-order ownership contract first.

Until those contracts exist, the current safe Allegro state is:

- Seller/workspace order dashboard exists.
- Bounded polling/status projection from Orders exists in `/dashboard/orders`.
- Buyer-facing personal order cabinet remains `[MISSING]`.
