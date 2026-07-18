# TASK-007-D Redaction, Replay, And Versioning Handoff

## Intent Chain References

- Vision: `[MISSING: Vision details not read in this lane; execution plan references ../01_vision/VISION.md]`
- Goal Impact: `docs/22_goal_impact/GOAL-IMPACT-TASK-007.md`
- System: `docs/16_operations/INTEGRATIONS.md`
- Feature: `docs/10_features/FEAT-007-growth-analytics-and-demand-loops.md`
- Task: `docs/11_tasks/TASK-007-plan-growth-analytics-and-demand-loops.md`
- Execution Plan: `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`
- Coding Prompt: `[MISSING: TASK-007 coding prompt not approved or created]`
- Code: existing patterns only from `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.service.ts`, `services/allegro-service/src/allegro/ai-offer-optimization/ai-offer-optimization.contract.ts`, `shared/clients/order-client.service.ts`, `shared/logger/logger.util.ts`, and `shared/notifications/notification.interface.ts`
- Validation: TASK-007 requires contract tests, redaction scan, and replay review before closure

## Lane Scope

Define the redaction checklist, replay/idempotency rules, event versioning policy, and backwards-compatibility guidance and validation cases for Stage 5 growth analytics contracts. This lane does not approve runtime writes to leads, marketing, logging, or notifications.

## Redaction Checklist

- Keep TASK-007 examples, fixtures, and reports `synthetic` per `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`.
- Never include OAuth tokens, authorization headers, client secrets, API keys, passwords, cookies, or raw production logs.
- Never include raw customer identifiers, real email addresses, phone numbers, account numbers, supplier identifiers, or payment details.
- Replace asset URLs, recipient addresses, and account identifiers with `example.invalid`, synthetic IDs, or masked placeholders.
- For digest payloads, store only aggregates, counters, windows, and synthetic sample labels; no raw order lines, inquiry text, or message bodies.
- For logging and notification examples, exclude free-form metadata that could contain secrets or PII; prefer explicit allowlists over pass-through objects.
- Redaction evidence must name omitted fields. Minimum omitted-field set: `authorizationHeader`, `accessToken`, `refreshToken`, `clientSecret`, `recipient`, `customerEmail`, `customerPhone`, `paymentDetails`, `rawOrderPayload`, `rawErrorPayload`.
- If a downstream contract cannot operate without a sensitive field, stop contract approval and mark `[MISSING: approved secure transport for sensitive growth payload field]`.

## Replay And Idempotency Rules

- Every growth event envelope must carry `eventName`, `contractVersion`, `sourceService`, `channel`, `occurredAt`, `correlationId`, and `idempotencyKey`.
- Use stable business identity in `idempotencyKey`, not `Date.now()`-style entropy. Recommended shape: `<eventName>:<channel>:<accountId>:<subjectId>:<stateVersion-or-window>`.
- Replays of the same business fact must preserve the same `idempotencyKey` and `correlationId`.
- If an event reflects a state transition, emit once per transition boundary. Example: one `allegro.publish.succeeded` per terminal publish attempt ID.
- If an event reflects an aggregation window, the window bounds must be part of the idempotency identity. Example: `allegro.digest.daily:<accountId>:2026-06-20`.
- Downstream consumers must treat duplicate deliveries as safe no-ops or last-write-wins updates keyed by `idempotencyKey`.
- If the source cannot build a stable key from approved fields, mark the event blocked with `[MISSING: owner-approved idempotency identity for <event>]`.
- Logging-only replay is acceptable when duplicates are explicitly tagged and consumers ignore them; leads/marketing write paths need stronger duplicate handling before activation.

## Event Versioning Policy

- Keep business event names stable and separate from payload contract version.
- Each outbound growth payload must include a string `contractVersion`.
- Additive, optional fields may stay within the current version only if existing required fields and semantics do not change.
- Breaking changes require a new version and a compatibility plan before any production write path is enabled.
- Follow existing repo patterns:
  - cross-service contract strings may use semantic labels like `orders.create.v1`
  - task-scoped documented contracts may use dated labels like `2026-06-20.ai-offer-optimization.v1`
- TASK-007-E should choose one canonical naming convention for growth events and apply it consistently across logging, leads, marketing, and digest artifacts.
- Minimum envelope compatibility fields: `eventName`, `contractVersion`, `sourceService`, `channel`, `accountId`, `correlationId`, `idempotencyKey`, `redaction`, and payload body.
- The payload must expose a `redaction` object describing `classification`, applied rules, and omitted fields whenever omission materially changes observability.

## Backwards-Compatibility Guidance

- Do not rename or repurpose an existing event within the same version.
- Prefer additive payload evolution. New consumers may require new optional fields; old consumers must ignore unknown fields.
- When a field meaning changes, create a new version instead of overloading the existing field.
- For consumer migrations, support dual-publish or dual-parse during rollout if any downstream service already depends on the older version.
- Do not activate leads or marketing writes until each consumer owner confirms accepted versions, duplicate behavior, and failure semantics.
- Notification digests should tolerate missing upstream metrics and render `[MISSING: <metric source>]` rather than synthesizing values.
- `[MISSING: owner-approved version negotiation policy for logging-microservice]`
- `[MISSING: owner-approved duplicate handling contract for leads-microservice]`
- `[MISSING: owner-approved duplicate handling and segment upsert contract for marketing-microservice]`
- `[MISSING: owner-approved digest contract version and recipient model for notifications-microservice]`

## Validation Cases

1. Redaction fixture test: synthetic growth event fixture excludes all forbidden fields and reports omitted-field names.
2. Replay test: the same synthetic business input generates the same `idempotencyKey` and `correlationId`.
3. Duplicate delivery test: downstream adapter receives the same event twice and records one logical result or a documented no-op.
4. Version guard test: unsupported `contractVersion` is rejected or routed to explicit compatibility handling.
5. Additive compatibility test: older consumer fixture ignores a newly added optional field without failure.
6. Breaking-change test: changed required field or meaning forces a new version artifact instead of silent reuse.
7. Digest determinism test: the same synthetic source window renders the same digest payload and same window-scoped idempotency key.
8. Notification safety test: digest/alert payloads never contain raw recipients, tokens, or free-form secret-bearing metadata.
9. Logging safety test: error context is redacted before emission and never includes raw upstream request/response bodies.

## Blockers And Unavailable Facts

- `[MISSING: approved Stage 5 event envelope schema artifact]`
- `[MISSING: authoritative growth event owner for final contract naming]`
- `[MISSING: logging-microservice accepted growth event schema and error-context limits]`
- `[MISSING: leads-microservice growth demand event contract and consent boundary]`
- `[MISSING: marketing-microservice segment ingestion contract and upsert semantics]`
- `[MISSING: notifications-microservice digest payload contract for daily/weekly channel summaries]`
- `[UNKNOWN: whether any existing downstream consumer requires date-versioned vs semantic-versioned growth contracts]`

## Handoff Recommendation For TASK-007-E

Use this lane as the safety baseline for every Stage 5 event contract. Final integration should not approve production writes until version naming, duplicate behavior, and redaction evidence are confirmed by each downstream owner.
