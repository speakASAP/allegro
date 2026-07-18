# Integrations

```yaml
id: INTEGRATIONS-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../SYSTEM.md
  - ../06_architecture/ARCHITECTURE_OVERVIEW.md
  - ../08_roadmap/ROADMAP.md
downstream:
  - ../17_governance/PROJECT_INVARIANTS.md
  - ../09_milestones/MS-002-revenue-orchestration-foundation.md
related_adrs:
  - ../07_decisions/ADR-001-preserve-existing-nestjs-prisma-service-boundary.md
```

## Purpose

List integration boundaries that execution plans must preserve or explicitly validate. This document is the operating map for connecting `allegro-service` with the Alfares ecosystem to increase sales while protecting source-of-truth ownership.

## Current Service Boundaries

| Integration | Direction | Current Constraint | Runtime Evidence |
|---|---|---|---|
| catalog-microservice | outbound | Validate offer mutations and keep catalog as product owner. | `shared/clients/catalog-client.service.ts`, `catalogProductId` in Prisma. |
| warehouse-microservice | outbound + inbound events | Warehouse owns stock; Allegro consumes `stock.updated`, `stock.low`, `stock.out`. | `shared/clients/warehouse-client.service.ts`, `shared/rabbitmq/stock-events.subscriber.ts`. |
| orders-microservice | outbound | Forward orders; do not own orders locally. | `shared/clients/order-client.service.ts` with `orders.create.v1`. |
| auth-microservice | outbound/inbound auth | Preserve admin/operator auth boundary. | `shared/auth/*`, gateway auth routes. |
| logging-microservice | outbound | Do not log secrets or raw protected data. | `shared/logger/*`. |
| notifications-microservice | outbound | Send operational alerts without exposing secrets. | `shared/notifications/*`. |
| Allegro REST API/OAuth2 | outbound | Respect OAuth secret handling and API rate limit. | `services/allegro-service/src/allegro/*`. |

## Planned Ecosystem Boundaries

| Integration | Planned Direction | Revenue Purpose | Contract Rule |
|---|---|---|---|
| ai-microservice | outbound | Offer content, category, attribute, image, price, and quality suggestions. | Suggestions only until policy-confirmed; no autonomous publish. |
| leads-microservice | outbound | Capture marketplace demand and missed-sale signals. | Send redacted, contract-versioned lead events only. |
| marketing-microservice | outbound | Build segments for high-potential products, stale stock, and remarketing. | Requires funnel event taxonomy first. |
| minio-microservice | outbound | Store/serve approved offer media and generated image variants. | No raw secrets or unapproved copyrighted assets in storage. |
| payments-microservice | outbound/read-only first | Settlement, payment state, refund, and margin evidence. | Start read-only; writes require ADR and contract validation. |
| suppliers-microservice | outbound | Supplier stock, cost, reservation, lead time, replenishment. | Replace placeholders through explicit supplier contract. |

## Integration Design Rules

- Every client must have timeout, retry/backoff, structured logging, and safe failure behavior appropriate to the business action.
- Revenue-critical writes must be idempotent or have a durable attempt record.
- Cross-service event payloads must carry contract version, source service, channel, account id where relevant, idempotency key, and redacted error context.
- Contract changes require task-level validation and, if ownership boundaries change, ADR review.
- Sensitive fields must be excluded from logs, reports, prompts, screenshots, and example fixtures.

## Revenue Event Taxonomy

The roadmap standardizes these business events for logging, analytics, notifications, leads, and marketing integrations:

| Event | Trigger | Primary Consumers |
|---|---|---|
| `allegro.catalog.ready` | Catalog product passes readiness scoring. | logging, marketing |
| `allegro.draft.created` | Offer draft prepared from catalog or manual import. | logging |
| `allegro.policy.blocked` | Policy gate prevents publish/update. | logging, notifications |
| `allegro.publish.confirmed` | Operator or allowed workflow confirms publish. | logging |
| `allegro.publish.succeeded` | Allegro command completes successfully. | logging, marketing |
| `allegro.publish.failed` | Publish/update command fails or times out. | logging, notifications |
| `allegro.stock.synced` | Warehouse stock is reflected in local/Allegro offer state. | logging |
| `allegro.stock.drift` | Warehouse and Allegro state diverge beyond threshold. | logging, notifications |
| `allegro.order.received` | Allegro order/event received. | logging |
| `allegro.order.forwarded` | orders-microservice accepts forwarded order. | logging |
| `allegro.order.forward_failed` | Order forwarding fails after retry policy. | logging, notifications |
| `allegro.margin.warning` | Product/order margin falls below floor. | logging, notifications, marketing |
| `allegro.demand.signal` | Inquiry, out-of-stock demand, repeated interest, or failed sale signal is detected. | leads, marketing |

## Approved Task Contracts

- TASK-004 catalog sell action: `POST /allegro/catalog-sell/prepare`, `POST /allegro/catalog-sell/bulk-prepare`, `POST /allegro/catalog-sell/:attemptId/confirm`, and `GET /allegro/catalog-sell/:attemptId/status` compose catalog ownership, lifecycle queueing, and policy evaluation without direct publish side effects.
- TASK-005 AI offer optimization contract: `docs/16_operations/AI_OFFER_OPTIMIZATION_CONTRACT.md` defines advisory `POST /internal/ai/offer-suggestions/generate` request/response payloads, review-state transitions, redaction rules, and the future lifecycle handoff boundary without approving runtime ai-microservice client code or direct marketplace mutation.
- TASK-005 AI offer optimization contract: `buildAiOfferOptimizationRequest()`, `buildAiSuggestionRecord()`, and `buildApprovedSuggestionPatch()` define an advisory ai-microservice envelope, deterministic snapshot hash, redaction rules, and explicit approval-gated lifecycle handoff without direct Allegro mutation or live ai-microservice dependency.
- TASK-006 stock order profit loop contract: `services/allegro-service/src/allegro/stock-order-profit-loop/stock-order-profit-loop.contract.ts` defines durable stock-sync attempt envelopes, orders-microservice replay identity, read-only payment lookup, supplier dry-run lookup, and coverage-based margin status without runtime writes.
- TASK-007 growth analytics contract pack: `reports/validation/TASK-007-A-funnel-taxonomy-handoff.md`, `reports/validation/TASK-007-B-leads-marketing-handoff.md`, `reports/validation/TASK-007-C-digest-metrics-handoff.md`, and `reports/validation/TASK-007-D-redaction-replay-handoff.md` define the draft `2026-06-20.allegro-funnel.v1` taxonomy candidate, leads/marketing envelope drafts, digest payloads, and redaction/replay/versioning rules using synthetic examples only.
- TASK-007 runtime boundary: downstream leads, marketing, digest-delivery, click telemetry, payment/refund, cancellation, and margin-economics integrations remain blocked by explicit `[MISSING: ...]` owner and source contracts; TASK-007 approves contract-first design only and does not enable runtime writes.
- TASK-008 operations trust plan: `reports/validation/TASK-008-A-rate-limit-queue-handoff.md`, `reports/validation/TASK-008-B-oauth-health-handoff.md`, `reports/validation/TASK-008-C-minio-media-handoff.md`, and `reports/validation/TASK-008-D-smoke-rollback-handoff.md` define the account-aware queue controls, OAuth risk map, MinIO media contract matrix, and deploy smoke or rollback evidence requirements for Stage 6 using synthetic examples only.
- TASK-008 runtime boundary: rate-limit enforcement changes, OAuth alert delivery runtime hooks, MinIO media dependency, deploy-script changes, Kubernetes manifest changes, and production smoke execution remain blocked pending separate approved coding or operations tasks; TASK-008 closes at the planning and validation layer only.

## Validation

Contract-affecting tasks must identify affected integrations, source-of-truth ownership, test commands, failure behavior, rollback plan, and redaction evidence in the execution plan.
