# Roadmap

```yaml
id: ROADMAP-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
  - ../02_business_case/BUSINESS_CASE.md
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
  - ../06_architecture/ARCHITECTURE_OVERVIEW.md
  - ../16_operations/INTEGRATIONS.md
downstream:
  - ../09_milestones/MS-001-ips-baseline.md
  - ../09_milestones/MS-002-revenue-orchestration-foundation.md
  - ../09_milestones/MS-003-catalog-to-allegro-conversion-engine.md
  - ../09_milestones/MS-004-intelligent-offer-optimization.md
  - ../09_milestones/MS-005-stock-order-profit-loop.md
  - ../09_milestones/MS-006-growth-analytics-and-remarketing.md
  - ../09_milestones/MS-007-operations-trust-and-scale.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Purpose

Sequence `allegro-service` work so future implementation remains traceable to intent, validation evidence, and measurable revenue impact. The roadmap expands the existing IPS baseline into a marketplace growth program: connect the Alfares ecosystem around Allegro so catalog products become better offers, offers convert into more orders, orders feed inventory and profit signals, and operators can improve the channel continuously without bypassing governance.

## Current Phase

Revenue orchestration planning on top of the completed IPS baseline. The repository path on `alfares` is `/home/ssf/Documents/Github/allegro-service`; older references to `allegro-microservice` should be treated as naming aliases until a repository rename is explicitly approved.

## Strategic Outcome

Increase marketplace earnings by turning Allegro from a synchronization service into a governed sales-channel engine that can:

- publish catalog products through high-converting Allegro offers;
- protect stock, order, OAuth, rate-limit, and catalog ownership invariants;
- use AI and historical performance data to improve titles, descriptions, pricing, photos, categories, and timing;
- feed orders, conversion, failures, and margin signals back to the ecosystem;
- expose visible goals, readiness gates, and validation evidence for every implementation wave.

## Non-Negotiable Invariants

All stages must preserve `../17_governance/PROJECT_INVARIANTS.md`:

| Invariant | Roadmap Meaning |
|---|---|
| ALG-INV-001 | No Allegro offer create/update/publish flow can bypass catalog validation. |
| ALG-INV-002 | Allegro API calls must remain account-aware and rate limited to max 1 request per second per account unless an approved newer limit policy exists. |
| ALG-INV-003 | Orders stay owned by orders-microservice; Allegro local order records are channel evidence and forwarding checkpoints only. |
| ALG-INV-004 | OAuth tokens, client secrets, API keys, payment secrets, customer data, and production logs stay out of docs, prompts, tests, and reports. |
| ALG-INV-005 | Boundary changes require an ADR before implementation. |
| ALG-INV-006 | Every coding task requires traceability, goal impact, and an execution plan. |
| ALG-INV-007 | Closure requires validation evidence. |

## Existing Implementation Baseline

The current code already contains useful integration primitives:

- `shared/clients/catalog-client.service.ts` for catalog products, pricing, and media.
- `shared/clients/warehouse-client.service.ts` for stock and warehouse operations.
- `shared/clients/order-client.service.ts` with `orders.create.v1` and idempotency fields.
- `shared/auth/*` for JWT validation and auth-microservice flows.
- `shared/logger/*` and `shared/notifications/*` for centralized operational signals.
- `shared/rabbitmq/stock-events.subscriber.ts` for `stock.updated`, `stock.low`, and `stock.out` events.
- `services/allegro-service/src/allegro/*` for Allegro API, OAuth, products, offers, orders, events, and sync jobs.
- Prisma models for Allegro products, offers, orders, import jobs, sync jobs, accounts, and related marketplace state.

Important gaps from inspection:

- Stock events update local offer quantity but do not yet complete event-to-Allegro propagation.
- Offer publish/update flows need durable lifecycle records, explicit confirmation, policy gates, and monitoring similar to the stronger Bazos guarded lifecycle pattern.
- AI, leads, marketing, MinIO, payments, and suppliers are not consistently first-class integrations in Allegro runtime code and must be introduced through documented contracts.
- Notification hooks exist but are not wired into every high-value failure or revenue event.
- Root `TASKS.md` had no active product roadmap before this update.

## Ecosystem Integration Strategy

| Ecosystem Service | Current Allegro Status | Revenue Role | Roadmap Direction |
|---|---|---|---|
| catalog-microservice | Implemented client and `catalogProductId` ownership boundary. | Source of products, titles, descriptions, categories, media, pricing, attributes. | Build catalog-to-Allegro publish action, readiness scoring, missing-data repair loop, and conversion feedback to catalog. |
| warehouse-microservice | Implemented client and RabbitMQ stock consumption. | Prevent oversell, prioritize available inventory, reserve/release stock, identify sellable products. | Finish event-to-Allegro stock sync, low-stock actions, profitability-aware availability rules. |
| orders-microservice | Implemented client with `orders.create.v1`. | System of record for sales and fulfillment. | Add retry/reconciliation visibility, SKU enrichment, order profitability feedback, and channel-account idempotency checks. |
| ai-microservice | Not implemented as a client; only AI metadata exists. | Generate and evaluate offer content, category suggestions, pricing hints, listing quality checks. | Introduce an AI contract for suggestions only; human or policy-confirmed publish remains required. |
| auth-microservice | Implemented shared auth services and guards. | Secure operator, admin, customer, and automation surfaces. | Apply stronger RBAC to destructive operations and separate admin/client capabilities. |
| logging-microservice | Implemented centralized logging. | Gives revenue funnel and failure observability. | Standardize structured business events: prepare, validate, publish, sync, order-forward, stock-adjust, conversion, failure. |
| notifications-microservice | Implemented notification client. | Shortens reaction time to stock, OAuth, publish, and order failures. | Wire alerts into high-value operational events and daily revenue digest. |
| marketing-microservice | Not implemented. | Campaign and remarketing triggers for products/offers with demand. | Add contract after event taxonomy exists; emit lead/conversion segments without raw sensitive data. |
| leads-microservice | Not implemented. | Capture marketplace interest and missed-sale signals. | Add lead events for questions, abandoned orders if available, out-of-stock demand, and failed publish opportunities. |
| payments-microservice | Env placeholders exist, no client found. | Profit, payment state, refund, and settlement insight. | Define read-only settlement/payment status contract before operational dependency. |
| suppliers-microservice | Placeholder supplier logic exists. | Source availability, cost, replenishment, dropship decisions. | Replace placeholders with supplier stock/cost/reservation contract. |
| minio-microservice | Not implemented. | Durable media storage and image optimization pipeline. | Store/transform approved product media and Allegro-ready assets through a documented media contract. |
| docs-rag/intent systems | Referenced operationally, not a revenue runtime service. | Keeps agents aligned with approved context. | Preserve IPS gates and context packages for every implementation wave. |

## Milestones

| Milestone | Goal | Status | Primary Revenue Lever |
|---|---|---|---|
| MS-001 | Add IPS documentation structure and gates | draft, validation passed | Delivery safety |
| MS-002 | Build the revenue orchestration foundation | planned | Reliable publish pipeline and goal tracking |
| MS-003 | Create catalog-to-Allegro conversion engine | planned | More sellable products listed with less operator effort |
| MS-004 | Add intelligent offer optimization | planned | Higher click-through and conversion rate |
| MS-005 | Close stock, order, payment, and supplier feedback loops | planned | Fewer lost sales, better margin, lower oversell risk |
| MS-006 | Add growth analytics, leads, marketing, and remarketing loops | planned | More repeat demand and better acquisition |
| MS-007 | Harden operations, trust, compliance, and scale | planned | Stable production growth and lower operational cost |

## Stage 0: IPS And Reality Alignment

Objective: keep the governance baseline useful while moving into implementation.

Deliverables:

- Reconcile `TASK-001` status with existing validation evidence.
- Mark stale README references to absent `docs/*` plans as documentation debt or recreate them under IPS if still needed.
- Keep every new milestone linked to features, tasks, execution plans, context packages, goal-impact records, and validation reports.

Exit criteria:

- `TASKS.md` reflects active roadmap tasks.
- Pre-coding and deployment-readiness gates pass after roadmap updates.

## Stage 1: Revenue Orchestration Foundation

Objective: introduce a durable, observable Allegro sales-channel lifecycle inspired by `bazos-service` but adapted to Allegro APIs and invariants.

Implementation themes:

- Add `prepare -> validate -> confirm -> enqueue -> claim -> execute -> recordResult -> reconcile` lifecycle for publish, update, stock-sync, and order-forwarding work.
- Create `AllegroPublishAttempt` or equivalent durable attempt model with account, catalog product, offer, policy result, idempotency key, status, failure reason, command id, and timestamps.
- Add Allegro-specific policy gates: catalog validation, OAuth/account readiness, rate-limit readiness, duplicate offer check, category compatibility, GPSR/responsible producer completeness, delivery/payment completeness, media readiness, stock availability, and margin floor.
- Add monitoring endpoints for blocked attempts, stale attempts, rate-limit backlog, OAuth expiry, stock sync drift, and order-forwarding failures.

Exit criteria:

- Operators can see why an offer cannot publish before it calls Allegro.
- Publish/update attempts are replay-safe and auditable.
- No direct destructive offer path bypasses policy gates.

## Stage 2: Catalog-To-Allegro Conversion Engine

Objective: make it easy and safe to sell more catalog products on Allegro.

Implementation themes:

- Add catalog-facing `Sell on Allegro` action similar to Bazos `catalog sell-action`, but with Allegro-specific policy gates and account/category/payment/delivery requirements.
- Generate offer drafts from catalog product data without publishing automatically.
- Score catalog products for Allegro readiness: required attributes, category mapping, media, stock, price, margin, delivery, payment, producer/GPSR compliance.
- Return actionable missing-data fixes to catalog-microservice and operators.
- Create bulk prepare flows with throttled execution and per-account publish queues.

Exit criteria:

- A catalog user can prepare an Allegro offer, inspect policy blockers, confirm publish, and poll status through a documented API.
- Bulk listing cannot exceed rate limits or bypass catalog validation.

## Stage 3: Intelligent Offer Optimization

Objective: improve conversion rate by using AI and performance feedback without letting AI mutate offers unsafely.

Implementation themes:

- Define an ai-microservice contract for suggestions: titles, descriptions, bullets, category candidates, attribute completion, image recommendations, competitor/market positioning if available.
- Use historical Allegro events, local offer performance, order outcomes, stock availability, and margin rules to rank suggestions.
- Keep AI output as recommendations or drafts until policy-confirmed.
- A/B or sequentially test title/description/price changes using deterministic experiment records.
- Add human-review and rollback workflow for AI-assisted changes.

Exit criteria:

- Operators can compare current offer vs suggested offer improvements with expected impact and risk.
- AI suggestions include evidence, confidence, and policy blockers.
- Approved changes go through the same publish lifecycle as manual changes.

## Stage 4: Stock, Order, Payment, Supplier, And Profit Loop

Objective: make every sale update stock, fulfillment, margin, and replenishment signals across the ecosystem.

Implementation themes:

- Finish warehouse stock event propagation to Allegro for important stock changes.
- Add order-forwarding retry/reconciliation dashboard and notifications.
- Enrich forwarded orders with SKU/catalog data where missing.
- Add read-only payments-microservice integration for payment/settlement/refund state once contract is confirmed.
- Replace supplier placeholder logic with suppliers-microservice contract for stock, cost, reservation, lead time, and replenishment recommendations.
- Compute contribution margin and profitability flags for offers and orders.

Exit criteria:

- Operators can identify profitable, unprofitable, blocked, oversell-risk, and replenishment-needed products.
- Order forwarding failures and stock drift cannot stay invisible.

## Stage 5: Growth Analytics, Leads, Marketing, And Remarketing

Objective: turn marketplace activity into demand intelligence.

Implementation themes:

- Emit structured funnel events to logging-microservice: catalog-ready, draft-created, policy-blocked, publish-requested, published, clicked if available, ordered, cancelled, stockout, order-forwarded, payment-settled, refund, margin-warning.
- Define leads-microservice events for marketplace inquiries, failed purchase demand, out-of-stock demand, and repeated product interest where available.
- Define marketing-microservice contract for segments and campaigns: high-demand stock-ready products, stale inventory, price-drop candidates, retargeting candidates, and cross-channel winners.
- Add daily/weekly channel performance digest via notifications-microservice.

Exit criteria:

- The service can explain which products earn money, which products fail to list, and which products deserve marketing attention.
- Growth events are redacted and contract-versioned.

## Stage 6: Operations, Trust, Compliance, And Scale

Objective: make the revenue engine safe to run continuously.

Implementation themes:

- Enforce account-aware rate limiting and queue backpressure.
- Add OAuth expiry/refresh monitoring and notifications.
- Add MinIO-backed media pipeline for approved Allegro-ready images if catalog/media contracts require it.
- Add SLA dashboards for publish attempts, order forwarding, stock sync, API errors, and notification delivery.
- Add disaster recovery and rollback playbooks for failed publish batches.
- Keep deployment scripts deterministic and validate production smoke after changes.

Exit criteria:

- Production deployments include validation evidence, smoke checks, and rollback path.
- Runtime failure modes are visible before they cause material revenue loss.

## Revenue Metrics

Every implementation wave should identify expected movement in at least one metric:

| Metric | Definition | Target Direction |
|---|---|---|
| Catalog-to-draft rate | Share of eligible catalog products prepared for Allegro | Increase |
| Draft-to-publish rate | Share of prepared drafts successfully published | Increase |
| Policy-block resolution time | Time from blocked to publish-ready | Decrease |
| Publish success rate | Published attempts / confirmed attempts | Increase |
| Offer conversion rate | Orders / published active offers or available Allegro funnel data | Increase |
| Order-forward success rate | Orders accepted by orders-microservice / Allegro orders received | Increase |
| Stock drift | Difference between warehouse availability and Allegro offer quantity | Decrease |
| Oversell incidents | Orders created when unavailable stock should have blocked sale | Decrease |
| Gross margin per order | Order revenue minus supplier/product/logistics/payment costs when available | Increase |
| Operational alert MTTA | Time to acknowledge OAuth, stock, publish, or order failures | Decrease |

## Sequencing Rules

- Documentation and execution plans precede code changes.
- Contract/schema changes require explicit validation evidence and ADR review when boundaries change.
- Runtime changes must preserve catalog product ownership, warehouse stock ownership, orders ownership, OAuth secrecy, and rate limits.
- AI integrations may recommend, draft, score, or explain; they may not publish or mutate offers outside the policy-confirmed lifecycle.
- New ecosystem integrations start with a contract document and a read-only or dry-run path before production writes.
- Deployment closure requires readiness gate evidence and production smoke notes.

## Validation

Roadmap changes must keep downstream milestone, feature, task, execution-plan, context-package, validation, and goal-impact links current. Implementation stages must run the repository gates plus targeted tests for affected clients, controllers, Prisma schema, queue workers, and integration contracts.
