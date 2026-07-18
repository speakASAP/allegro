# AI Offer Optimization Contract

```yaml
id: AI-OFFER-OPTIMIZATION-CONTRACT
status: approved_for_task_005_scope
owner: allegro-service orchestrator
created: 2026-06-20
last_updated: 2026-06-20
completeness_level: complete
upstream:
  - ../10_features/FEAT-005-ai-assisted-offer-optimization.md
  - ../11_tasks/TASK-005-define-ai-offer-optimization-contract.md
  - ../21_execution_plans/EP-TASK-005-define-ai-offer-optimization-contract.md
```

## Purpose

Define the advisory-only contract between `allegro-service` and a future `ai-microservice` for listing optimization suggestions. The contract must improve operator decision quality without giving AI direct authority to publish, update, end, or otherwise mutate Allegro offers.

## Boundary Rules

- AI suggestions are advisory only.
- AI output must never call Allegro APIs directly.
- Any approved suggestion must be mapped into the existing governed publish lifecycle or future task-scoped equivalent.
- Contract examples, fixtures, and reports must stay synthetic and redacted.
- `catalog-microservice` remains product owner; `allegro-service` remains channel-state owner; `orders-microservice` remains order owner.

## Contract Version

- Contract version: `2026-06-20.ai-offer-optimization.v1`
- Channel: `allegro`
- Direction: outbound request from `allegro-service`, advisory response from `ai-microservice`

## Request Contract

### Endpoint

- Proposed endpoint: `POST /internal/ai/offer-suggestions/generate`
- Auth: `[MISSING: ai-microservice owner-approved internal auth contract]`

### Required request fields

| Field | Type | Rule |
|---|---|---|
| `contractVersion` | string | Must equal `2026-06-20.ai-offer-optimization.v1`. |
| `correlationId` | string | Stable per request for replay-safe tracing. |
| `channel` | string | Must be `allegro`. |
| `accountId` | string | Synthetic/account UUID; required for rate-limit and policy context. |
| `catalogProductId` | string | Required when the suggestion originates from catalog-owned data. |
| `offerId` | string nullable | Local Allegro offer UUID when a draft or existing offer exists. |
| `snapshotHash` | string | Hash of the redacted input snapshot that produced the request. |
| `requestedSuggestionTypes` | string[] | Allowed values: `title`, `description`, `attributes`, `category`, `images`, `pricing`, `quality_score`. |
| `offerContext` | object | Redacted offer/channel snapshot; see below. |
| `policyContext` | object | Current blockers, warnings, and recommendations from the policy engine. |
| `performanceContext` | object | Aggregated metrics only; no raw customer/order records. |
| `constraints` | object | Human/policy guardrails such as currency, draft-only, and forbidden mutations. |

### `offerContext` shape

```json
{
  "title": "Synthetic hiking backpack 40L",
  "descriptionSections": ["lightweight nylon", "water resistant"],
  "categoryId": "12345",
  "attributes": [{"id": "capacity", "value": "40L"}],
  "images": ["https://example.invalid/backpack-front.jpg"],
  "price": {"amount": "199.99", "currency": "PLN"},
  "stock": {"available": 12, "status": "IN_STOCK"},
  "qualitySignals": {"missingAttributes": 1, "imageCount": 1, "validationStatus": "WARNINGS"}
}
```

### `policyContext` shape

```json
{
  "publishReadiness": "WARN",
  "blockers": [],
  "warnings": ["image-count-low"],
  "recommendations": ["add-lifestyle-image"],
  "reviewRequired": true
}
```

### `performanceContext` shape

```json
{
  "window": "30d",
  "views": 240,
  "conversions": 4,
  "returnRate": 0,
  "marginStatus": "UNKNOWN",
  "notes": ["No customer identifiers included"]
}
```

### Request redaction rules

- Exclude OAuth tokens, Authorization headers, client secrets, customer identifiers, raw order lines, payment details, supplier secrets, and raw logs.
- Convert operational metrics into aggregates only.
- Replace real asset URLs with approved public or `example.invalid` placeholders in fixtures.
- Remove free-form operator notes unless they are already redacted and classified synthetic.

## Response Contract

### Required response fields

| Field | Type | Rule |
|---|---|---|
| `contractVersion` | string | Echo request version. |
| `correlationId` | string | Echo request correlation id. |
| `generatedAt` | ISO timestamp | Response creation timestamp. |
| `snapshotHash` | string | Must match the request snapshot hash. |
| `model` | object | Provider/model/version metadata when available. |
| `suggestions` | array | One or more advisory suggestions. |
| `summary` | object | Roll-up status and next-action guidance. |
| `redactionReport` | object | Confirms redaction profile and omitted fields. |

### Suggestion shape

```json
{
  "suggestionId": "sg-001",
  "type": "title",
  "targetField": "title",
  "status": "DRAFT_REVIEW",
  "proposedValue": "Synthetic ultralight hiking backpack 40L",
  "confidence": 0.82,
  "expectedImpact": "higher click-through on outdoor keyword search",
  "evidence": [
    "title length improved",
    "high-intent keyword added"
  ],
  "policyBlockers": [],
  "rollbackNotes": [
    "restore previous title if CTR falls after approved experiment window"
  ],
  "requiresHumanReview": true
}
```

### `summary` shape

```json
{
  "overallStatus": "ADVISORY_ONLY",
  "reviewState": "PENDING_OPERATOR_REVIEW",
  "nextAction": "review_suggestions",
  "blockedApplyReasons": [
    "direct_publish_forbidden",
    "manual_mapping_to_lifecycle_required"
  ]
}
```

### Response redaction rules

- Do not return hidden provider credentials, raw embeddings, unredacted marketplace logs, or copied protected customer/order content.
- If the model explanation references excluded data, replace it with a high-level synthetic rationale.
- `model.version` may be `[MISSING: provider version metadata]` when the provider does not expose it safely.

## Local Suggestion Record Design

TASK-005 approves the record shape conceptually but does not add runtime schema in this task.

| Field | Purpose |
|---|---|
| `id` | Local suggestion record UUID. |
| `contractVersion` | Ties the record to the approved advisory contract. |
| `correlationId` | Replay-safe request/response correlation. |
| `snapshotHash` | Detects stale or mismatched apply attempts. |
| `accountId` | Keeps account-level rate-limit and ownership context explicit. |
| `catalogProductId` | Links back to catalog-owned product state when present. |
| `offerId` | Links to the local channel projection when present. |
| `suggestionType` | Title, description, attributes, category, images, pricing, or quality score. |
| `reviewStatus` | `DRAFT_REVIEW`, `APPROVED_FOR_APPLY`, `REJECTED`, `EXPIRED`, `APPLIED`, or `ROLLED_BACK`. |
| `modelMetadata` | Provider/model/version summary only. |
| `policySnapshot` | Redacted blockers, warnings, and recommendations current at generation time. |
| `proposedValue` | Suggested change payload. |
| `expectedImpact` | Human-readable experiment or quality hypothesis. |
| `rollbackNotes` | Required notes for reverting approved experiments. |
| `reviewedByUserId` | Populated only when a human explicitly approves or rejects. |
| `approvedLifecycleAttemptId` | Links to a governed publish/update attempt when applied later. |

## Review-State Lifecycle

1. `DRAFT_REVIEW`: initial advisory state after AI response is stored.
2. `APPROVED_FOR_APPLY`: human approves a suggestion for mapping into a governed offer change.
3. `REJECTED`: human rejects the suggestion.
4. `EXPIRED`: input snapshot, policy context, or offer state is stale and requires regeneration.
5. `APPLIED`: approved suggestion has been mapped into a governed lifecycle attempt.
6. `ROLLED_BACK`: approved suggestion was applied, then reverted after experiment or quality review.

## Apply Boundary

- TASK-005 does not approve direct apply endpoints.
- Future runtime work must translate `APPROVED_FOR_APPLY` suggestions into the same prepare/confirm/policy path used by TASK-002 and TASK-004.
- Price suggestions must remain advisory until TASK-006 profit and margin contracts are resolved.
- Category or attribute suggestions that affect catalog ownership require catalog-approved mapping before lifecycle confirmation.

## Metrics And Rollback Expectations

- Suggested metrics: click-through rate, listing readiness score, blocked-policy count, approved suggestion adoption rate, and experiment rollback count.
- Required rollback note for each suggestion: how to restore prior operator-approved content if results degrade or policy context changes.
- `[MISSING: owner-approved experiment window defaults by category/account]`

## Synthetic Fixtures

See `../reports/validation/TASK-005-validation-evidence.md` for request, response, and local-record examples that match this contract.

## Open Facts

- `[MISSING: ai-microservice owner-approved auth handshake]`
- `[MISSING: provider/model registry contract for runtime metadata]`
- `[MISSING: owner-approved experiment window defaults by category/account]`
