# TASK-008-C MinIO Media Contract Handoff

## Scope

TASK-008-C owns a planning handoff only. It does not approve runtime media uploads, bucket writes, presigned URL flows, image transformation jobs, deploy changes, or integration wording updates in shared files.

## Intent Preservation Chain

| Node | Reference |
| --- | --- |
| Vision | `docs/01_vision/VISION.md` |
| Goal Impact | `docs/22_goal_impact/GOAL-IMPACT-TASK-008.md` |
| System | `[UNKNOWN: no TASK-008-specific system artifact was cited in EP-TASK-008.]` |
| Feature | `docs/10_features/FEAT-008-operations-trust-and-scale.md` |
| Task | `docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md` |
| Execution Plan | `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md` |
| Coding Prompt | `[MISSING: TASK-008 remains in planning stage; no approved coding prompt exists for media runtime changes.]` |
| Code | `[MISSING: TASK-008-C delivers handoff only; no MinIO or media implementation change is approved in this lane.]` |
| Validation | This handoff plus TASK-008-E integration validation. |

## Contract Posture

- Classification: `synthetic`
- Current lane output: discovery requirements and contract gating notes only
- Proposed dependency boundary: `allegro-service` outbound to `minio-microservice` only after contract approval
- Shared naming owner: TASK-008-E for any final contract wording or integrations-map updates
- Prohibited in this lane: production media writes, asset migration, bucket creation, secret exposure, deploys, k8s changes, or runtime DTO changes

## Current Repo Evidence

| Evidence | What it proves | Constraint for TASK-008-C |
| --- | --- | --- |
| `docs/08_roadmap/ROADMAP.md` Stage 7 ecosystem table | `minio-microservice` is planned, not implemented, and intended for durable media storage plus image optimization. | Treat MinIO as a future boundary, not an existing runtime dependency. |
| `docs/10_features/FEAT-008-operations-trust-and-scale.md` | Acceptance requires media/MinIO integration to be contract-approved before runtime dependency. | TASK-008-C must stay contract-first. |
| `docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md` | Scope includes MinIO/media contract discovery and explicitly forbids media storage implementation before approval. | No implementation or deploy action is allowed here. |
| `docs/16_operations/INTEGRATIONS.md` planned ecosystem boundaries | `minio-microservice` is outbound only and must avoid secrets and unapproved copyrighted assets. | Contract must define storage safety and ownership before use. |
| `shared/clients/catalog-client.service.ts#getProductMedia()` | Catalog already exposes product media through `/api/media/product/:productId`. | Catalog remains the current upstream media source of truth until a MinIO contract is approved. |
| `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts#extractImageUrls()` | Allegro preparation already consumes `catalogProduct.images` and `catalogProduct.media` as URL candidates. | A MinIO contract must preserve backward-compatible URL consumption or define an explicit adapter. |
| `services/allegro-service/src/allegro/policy/policy-engine.service.ts` media gate | Current policy only checks whether local offer images exist. | There is no storage provenance, optimization status, or asset approval contract yet. |
| `prisma/schema.prisma` `images Json?` | Local offer state stores image URLs only, not media ownership metadata. | Any new media metadata would be a later contract/schema decision owned outside this lane. |

## Media Dependency Matrix

| Boundary | Current owner | Current repo evidence | Observed payload shape today | Missing contract facts | TASK-008-C posture |
| --- | --- | --- | --- | --- | --- |
| Catalog product media source | `catalog-microservice` | `shared/clients/catalog-client.service.ts` `/api/media/product/:productId` | `response.data.data` array; exact item schema is `[UNKNOWN: not defined in this repo]` | `[MISSING: canonical catalog media item schema, approval fields, and lifecycle states.]` | Preserve catalog as upstream media source until downstream contract is explicit. |
| Allegro draft preparation media intake | `allegro-service` | `extractImageUrls()` reads `images` and `media`, accepts string/url/src values | array of strings normalized to max 16 URLs | `[MISSING: approved image ordering, primary-image semantics, variant semantics, and invalidation rules.]` | Keep current URL intake backward-compatible. |
| Policy readiness for media | `catalog-microservice` owner in policy gate | `media-readiness` warns when no images exist | image count only | `[MISSING: asset approval state, optimization completeness, copyright review flag, and provenance evidence.]` | Treat current gate as presence-only, not contract-complete. |
| Local persisted offer media | `allegro-service` | Prisma `images Json?` and offer services | array of image URLs or normalized `{url}` payloads before Allegro calls | `[MISSING: metadata contract for storage source, checksum, size, mime type, transformation lineage, and retention class.]` | Do not expand persistence semantics in this lane. |
| Planned object storage boundary | `minio-microservice` | `docs/16_operations/INTEGRATIONS.md`, `docs/08_roadmap/ROADMAP.md`, `docs/09_milestones/MS-007-operations-trust-and-scale.md` | none implemented in repo | `[MISSING: endpoint, auth flow, bucket model, object key contract, transform API, and delete/retention rules.]` | Block runtime dependency until approved. |
| Allegro publish/update image usage | `allegro-service` outbound to Allegro API | offer/publish flows require image URLs and reject unsupported PATCH image updates | URL list passed on create; PATCH removes images | `[MISSING: rule for when MinIO-derived URLs are immutable enough for Allegro create/update paths.]` | TASK-008-E must confirm creation/update compatibility before runtime adoption. |

## Contract Discovery Requirements

### Ownership requirements

| Topic | Required owner decision | Current status |
| --- | --- | --- |
| Source-of-truth for approved product media | Confirm whether catalog stays canonical and MinIO only stores derivatives, or whether MinIO becomes the durable master store. | `[MISSING: approved media ownership boundary between catalog-microservice and minio-microservice.]` |
| Runtime caller for storage actions | Confirm whether `allegro-service`, `catalog-microservice`, or an offline media pipeline invokes MinIO writes/transforms. | `[MISSING: service owner for upload/transform requests.]` |
| Asset approval and legal review | Confirm which service or operator state marks media safe for marketplace publication. | `[MISSING: approved asset-review authority and status model.]` |
| Deletion/retention authority | Confirm who can delete media, archive variants, or preserve evidence after listing removal. | `[MISSING: retention owner and purge policy.]` |

### Endpoint and payload requirements

| Requirement | Why it is needed | Current status |
| --- | --- | --- |
| Write contract for asset ingest | Needed to know whether source is URL pull, binary upload, or catalog reference replication. | `[MISSING: ingest endpoint or event contract.]` |
| Read contract for Allegro-ready asset resolution | Needed so `allegro-service` can obtain stable, publication-safe image URLs. | `[MISSING: asset retrieval endpoint and response schema.]` |
| Variant/optimization contract | Needed to define thumbnail, watermark-free marketplace image, and resize/compression outputs. | `[MISSING: variant names, dimensions, mime constraints, and readiness states.]` |
| Failure contract | Needed for timeout, retry, redaction-safe error surfaces, and non-destructive fallback to catalog URLs. | `[MISSING: error taxonomy and retry/idempotency semantics.]` |
| Object identity contract | Needed to keep replay deterministic across retries and repeated publish attempts. | `[MISSING: object key strategy, checksum field, and dedupe semantics.]` |

### Security and compliance requirements

| Requirement | Why it is needed | Current status |
| --- | --- | --- |
| Secret handling model | `ALG-INV-004` forbids credentials in code/docs/reports. | `[MISSING: approved auth pattern for MinIO access, such as service credentials or signed internal requests.]` |
| Copyright and approval guard | Integrations doc forbids unapproved copyrighted assets in storage. | `[MISSING: field-level approval and provenance contract.]` |
| Redaction-safe observability | Operational reports must stay synthetic and secret-safe. | `[MISSING: allowed storage/logging fields for object IDs, URLs, and error diagnostics.]` |
| Retention classification | Needed to align raw source images, optimized variants, and publish evidence with data lifecycle rules. | `[MISSING: retention classes and deletion SLAs.]` |

## Proposed Contract Questions For TASK-008-E

1. Does `catalog-microservice` remain the canonical product-media owner while `minio-microservice` only stores transformed derivatives, or is ownership expected to shift?
2. Is the MinIO interaction synchronous request/response, asynchronous job submission, or event-driven asset preparation?
3. What exact response shape should downstream consumers rely on: public URL, signed URL, internal object ID plus resolver, or all three?
4. Are Allegro-ready image URLs immutable for the lifetime of an offer draft/publish attempt, and if not, what refresh window applies?
5. Which fields prove an asset is approved for marketplace use: copyright review, source provenance, checksum, dimensions, mime type, moderation state, or operator approval?
6. What is the fallback behavior when MinIO is unavailable: block publish, warn and continue with catalog URLs, or reuse last known approved variants?
7. Which service owns deletion, reprocessing, and orphan cleanup for transformed assets after catalog updates or offer retirement?

## Draft Contract Shape Candidates

These are planning candidates only, not approved interfaces.

### Candidate ingest envelope

```yaml
contract_name: minio-media-ingest
contract_version: 0.1.0-draft
source_service: catalog-microservice
requested_by: allegro-service
required_fields:
  - contractVersion
  - sourceService
  - requestedBy
  - catalogProductId
  - mediaSourceRef
  - mediaChecksum
  - originalUrl
  - requestedVariants
  - approvalState
  - idempotencyKey
optional_fields:
  - sourceFilename
  - mimeType
  - width
  - height
  - retentionClass
```

Synthetic example:

```json
{
  "contractVersion": "0.1.0-draft",
  "sourceService": "catalog-microservice",
  "requestedBy": "allegro-service",
  "catalogProductId": "PRODUCT_SYNTHETIC_001",
  "mediaSourceRef": "CATALOG_MEDIA_SYNTHETIC_001",
  "mediaChecksum": "sha256:catalog-media-synthetic-001",
  "originalUrl": "https://example.invalid/catalog/product-001/original.jpg",
  "requestedVariants": ["allegro_primary", "allegro_gallery"],
  "approvalState": "approved_for_marketplace",
  "idempotencyKey": "sha256:minio-ingest-product-001-media-001"
}
```

### Candidate resolution envelope

```yaml
contract_name: minio-media-resolution
contract_version: 0.1.0-draft
source_service: minio-microservice
consumer_service: allegro-service
required_fields:
  - contractVersion
  - sourceService
  - consumerService
  - catalogProductId
  - mediaSourceRef
  - objectRef
  - variant
  - assetUrl
  - approvalState
  - checksum
  - idempotencyKey
optional_fields:
  - expiresAt
  - mimeType
  - width
  - height
```

Synthetic example:

```json
{
  "contractVersion": "0.1.0-draft",
  "sourceService": "minio-microservice",
  "consumerService": "allegro-service",
  "catalogProductId": "PRODUCT_SYNTHETIC_001",
  "mediaSourceRef": "CATALOG_MEDIA_SYNTHETIC_001",
  "objectRef": "MINIO_OBJECT_SYNTHETIC_001",
  "variant": "allegro_primary",
  "assetUrl": "https://example.invalid/media/allegro-primary-001.jpg",
  "approvalState": "approved_for_marketplace",
  "checksum": "sha256:minio-variant-synthetic-001",
  "idempotencyKey": "sha256:minio-resolution-product-001-media-001"
}
```

## Deterministic Synthetic Validation Ideas

1. Shape validation: feed catalog media fixtures containing both `images` and `media` arrays and confirm any future contract adapter resolves a deterministic ordered URL list.
2. Replay validation: submit the same synthetic ingest envelope twice and require the same `idempotencyKey`, `objectRef`, and variant list with no duplicate side effects.
3. Fallback validation: simulate MinIO-unavailable response and confirm the contract decision is explicit: blocked, warned, or catalog-URL fallback.
4. Approval validation: reject any synthetic asset whose `approvalState` is not marketplace-approved even if a URL exists.
5. Compatibility validation: verify a resolved asset URL remains acceptable to current Allegro create flows while PATCH-update paths continue not to depend on image mutation.
6. Redaction validation: operational evidence must keep only synthetic refs like `PRODUCT_SYNTHETIC_001`, `CATALOG_MEDIA_SYNTHETIC_001`, and `example.invalid` URLs.
7. Variant determinism validation: the same source checksum plus variant name must resolve to the same synthetic `objectRef` and checksum in fixtures.

## Blockers And Missing Facts

- `[MISSING: minio-microservice repository contract, endpoint definitions, or checked-in client code in allegro-service.]`
- `[MISSING: authoritative schema for catalog media items returned by /api/media/product/:productId.]`
- `[MISSING: approved ownership split between catalog product media and MinIO-derived variants.]`
- `[MISSING: approved authentication and secret-handling mechanism for MinIO access.]`
- `[MISSING: bucket/object naming convention, retention classes, and deletion authority.]`
- `[MISSING: approval/provenance fields proving an asset is legal and safe to publish.]`
- `[MISSING: failure-handling contract covering retry, timeout, fallback, and idempotency.]`
- `[UNKNOWN: whether Allegro-facing image URLs may be signed/expiring or must be stable public/internal URLs for publish lifecycle duration.]`
- `[UNKNOWN: whether image optimization is synchronous, queued, or event-driven.]`

## Ready-For-Integration Judgment

TASK-008-C is ready for TASK-008-E integration as a planning input only. The lane provides source-backed dependency mapping and explicit blocked facts, but final integration must keep the MinIO dependency contract-gated until owners, endpoint shapes, auth flow, and fallback semantics are approved.

## Sensitive-Data Safety Check

Manual review target for TASK-008-E:

- Confirm this handoff contains no real URLs, secrets, bucket names, object IDs, customer data, or raw production payloads.
- Confirm unresolved external facts remain marked `[MISSING: ...]` or `[UNKNOWN: ...]`.
- Confirm all examples stay synthetic and use `example.invalid` domains only.
