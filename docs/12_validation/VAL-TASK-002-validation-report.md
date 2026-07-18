# VAL-TASK-002: Governed Publish Lifecycle Validation

```yaml
id: VAL-TASK-002
status: pass
task: ../11_tasks/TASK-002-design-governed-publish-lifecycle.md
execution_plan: ../21_execution_plans/EP-TASK-002-design-governed-publish-lifecycle.md
created: 2026-06-13
last_updated: 2026-06-15
completeness_level: validated
sensitive_data_classification: synthetic
```

Validation id: VAL-TASK-002  
Target: TASK-002  
Date: 2026-06-15  
Validator: AI agent

## Summary

Validated the TASK-002 follow-up that was called out in the previous report: `UPDATE` lifecycle attempts now rely on a synchronous terminal-result contract via `OffersService.syncOfferUpdateToAllegroTerminal`, and lifecycle execution preserves terminal Allegro failure codes instead of collapsing them into a generic execution error. Remote-affecting `PUT /allegro/offers/:id` and `POST /allegro/offers/:id/sync-to-allegro` remain lifecycle-routed and can execute to `SUCCEEDED` or `FAILED` terminal results.

## Upstream goal

TASK-002 supports FEAT-002 and the roadmap goal to replace direct, hard-to-observe Allegro offer mutations with durable, observable, policy-gated publish/update attempts.

## Criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Durable attempt records | Pass | `AllegroPublishAttempt` model and migration still provide durable action/status/idempotency/policy evidence storage. |
| Lifecycle states documented | Pass | `policySnapshot.lifecycleStates` and this report define `PREPARED`, `BLOCKED`, `CONFIRMED`, `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, and `STALE`. |
| Idempotency prevents duplicates | Pass | Prepare still returns an existing attempt for the same key; targeted spec uses deterministic keys across repeated runs. |
| Catalog validation gate exists | Pass | Prepare blocks attempts without catalog validation evidence. |
| Account/OAuth readiness gate exists | Pass | Prepare records account readiness without storing token values. |
| Redacted failure/remediation context supported | Pass | Failed `UPDATE` executions now preserve structured Allegro terminal error codes and redact nested secret-like keys before storing failure context. |
| Monitoring query requirements | Pass | Lifecycle service still exposes list filters and monitoring summary for blocked, queued, running, failed, and stale attempts. |
| Queued publish execution | Pass | `PUBLISH` attempts continue to execute through the governed lifecycle. |
| Remote update path governance | Pass | `UPDATE` policy evaluation now records `update-terminal-contract` as `PASS`, and execution routes through `syncOfferUpdateToAllegroTerminal`. |
| Terminal update execution semantics | Pass | `services/allegro-service/src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts` covers prepare, terminal success, and terminal failure paths. |
| Direct remote create blocking | Pass | `POST /allegro/offers` still rejects direct remote creation unless `syncToAllegro=false`. |

## Gate evidence

- `npm run ips:pre-coding`: PASS on 2026-06-14. Report updated at `reports/validation/ips-pre-coding-gate.json`.
- `LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret npx ts-node src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts`: PASS on two consecutive runs from `services/allegro-service/`.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-14.
- `npm run ips:audit`: FAIL on 2026-06-14 due to unrelated documentation issues in `docs/12_validation/VAL-TASK-006-validation-report.md` and `docs/21_execution_plans/EP-TASK-007-plan-growth-analytics-and-demand-loops.md`.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-002`: FAIL on 2026-06-14 because the strict documentation audit is red and unresolved markers remain outside TASK-002 scope.


- `npm run ips:audit`: PASS on 2026-06-15 after TASK-006-E integration.
- `npm run ips:pre-coding`: PASS on 2026-06-15.
- `python3 scripts/deployment_readiness_gate.py --root . --target TASK-002`: PASS on 2026-06-15.
- `cd services/allegro-service && npm run build`: PASS on 2026-06-15.
- `LOGGING_SERVICE_URL=http://127.0.0.1 AUTH_SERVICE_URL=http://127.0.0.1 NOTIFICATION_SERVICE_URL=http://127.0.0.1 JWT_SECRET=test-secret npx ts-node src/allegro/publish-lifecycle/publish-lifecycle.update-terminal.spec.ts`: PASS on 2026-06-15.

## Invariant evidence

- ALG-INV-001: prepare still blocks without catalog validation evidence.
- ALG-INV-002: confirmed attempts still enter `QUEUED` before execution and record rate-limit evidence.
- ALG-INV-003: no order ownership changes were introduced.
- ALG-INV-004: policy evidence and failure context store token state or redacted placeholders, never OAuth tokens, Authorization headers, client secrets, or raw customer data.
- ALG-INV-005: no runtime ownership boundary change; the fix stays inside the existing NestJS/Prisma Allegro service boundary.
- ALG-INV-006: implementation remains traceable to FEAT-002, TASK-002, EP-TASK-002, GOAL-IMPACT-TASK-002, and this validation report.
- ALG-INV-007: validation evidence for the `UPDATE` terminal contract is now captured before closure.

## Sensitive-data scan evidence

The new targeted spec uses synthetic account, product, offer, and request identifiers only. Failure-context assertions verify that secret-like keys such as `accessToken` are stored as `[REDACTED]`.

## Replay and determinism evidence

The targeted `UPDATE` lifecycle spec passed on two consecutive runs with unchanged inputs. Each run asserted the same `PREPARED -> QUEUED -> RUNNING -> SUCCEEDED/FAILED` behavior, the same `update-terminal-contract` policy outcome, and the same redaction behavior for nested terminal error payloads.

## Issues found

- TASK-002 follow-up defect fixed: failed `UPDATE` executions previously recorded `EXECUTION_FAILED` because the lifecycle catch path dropped structured `HttpException` codes. The catch path now extracts `getResponse()` data and preserves terminal error codes such as `ALLEGRO_UPDATE_SYNC_FAILED`.
- Repository-wide IPS closure blockers from `VAL-TASK-006` and `EP-TASK-007` were cleared by TASK-006-E integration and handoff prompt repair.
- No new TASK-002 scope blocker was found. The remaining red gates are outside the allowed file scope for this lane.

## Recommendation

Accept the TASK-002 `UPDATE` terminal-contract follow-up as implemented and validated within scope. Close TASK-002 as implemented and validated. Continue with TASK-003 plan review before any marketplace policy engine coding prompt is generated.

## Traceability confirmation

TASK-002 remains aligned with the Allegro roadmap, FEAT-002, EP-TASK-002, GOAL-IMPACT-TASK-002, and project invariants. The follow-up specifically completes the `UPDATE` lifecycle terminal-result contract inside the governed publish lifecycle while preserving catalog, OAuth, order, and service-boundary ownership.
