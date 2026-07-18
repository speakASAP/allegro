# EP-TASK-001: Apply IPS Baseline

```yaml
id: EP-TASK-001
status: reviewed
source_task: ../11_tasks/TASK-001-apply-ips-baseline.md
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
vision: ../01_vision/VISION.md
constitution: ../00_constitution/CONSTITUTION.md
feature: ../10_features/FEAT-001-ips-governed-allegro-delivery.md
goal_impact: ../22_goal_impact/GOAL-IMPACT-TASK-001.md
```

## Metadata

- Source task: `../11_tasks/TASK-001-apply-ips-baseline.md`
- Status: draft for owner review.
- Lifecycle state: implemented as documentation baseline, pending owner approval.

## Upstream Traceability

- Constitution: `../00_constitution/CONSTITUTION.md`
- Vision: `../01_vision/VISION.md`
- Business case: `../02_business_case/BUSINESS_CASE.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Feature: `../10_features/FEAT-001-ips-governed-allegro-delivery.md`
- Goal impact: `../22_goal_impact/GOAL-IMPACT-TASK-001.md`

## Goal Impact

The plan adds governance and validation controls so future changes remain aligned with existing marketplace integration goals and production constraints.

## Project Invariants

- ALG-INV-001: Offer mutation requires catalog validation.
- ALG-INV-002: Allegro API rate limit must be preserved.
- ALG-INV-003: Orders must be forwarded to orders-microservice and not locally owned.
- ALG-INV-004: Secrets and OAuth tokens must remain protected.
- ALG-INV-005: Runtime service boundaries must remain unchanged for this task.
- ALG-INV-006: IPS traceability is required before implementation.
- ALG-INV-007: Validation evidence is required before closure.

## Sensitive-Data Handling

Classification: none. The task uses documentation only and must not include secrets, raw production records, OAuth tokens, real customer identifiers, or unmasked production logs.

## Contract Validation Plan

Runtime contracts are not changed. Documentation contracts are validated by `scripts/strict_doc_audit.py` and gate reports.

## Replay/Determinism Plan

Runtime replay is not affected. Gate outputs are repeatable for the same repository content aside from timestamps and report path metadata.

## Scope

Create IPS baseline docs, templates/contracts, gate scripts, npm scripts, and validation evidence.

## Non-Goals

No service code, Kubernetes manifest, database schema, deployment, or runtime integration behavior changes.

## Files to Inspect

- `BUSINESS.md`
- `SYSTEM.md`
- `README.md`
- `CLAUDE.md`
- `STATE.json`
- `package.json`

## Files to Create

- IPS folders `docs/00_constitution/` through `docs/23_documentation_contracts/` as needed.
- Gate scripts under `scripts/`.
- Validation reports under `docs/12_validation/` and generated reports under `reports/validation/`.

## Files to Modify

- `package.json` for IPS check scripts.
- Existing documentation index files may be updated only to reference IPS docs.

## Files That Must Not Be Modified

- `k8s/deployment.yaml`
- `k8s/service.yaml`
- TypeScript source files under `services/` and `shared/`
- `prisma/schema.prisma`
- `scripts/deploy.sh`
- Protected IPS files after baseline creation: `docs/00_constitution/CONSTITUTION.md`, `docs/01_vision/VISION.md`

## Implementation Steps

1. Create canonical IPS folder structure.
2. Add constitution and vision derived from existing approved service docs.
3. Add business, domain, system, subsystem, architecture, ADR, roadmap, milestone, feature, task, execution plan, context package, prompt, validation, audit, operations, governance, and goal impact docs.
4. Copy standard documentation contracts, templates, and gate scripts.
5. Add `ips:audit`, `ips:pre-coding`, `ips:readiness`, and `ips:check` scripts to `package.json`.
6. Run gate commands and update validation evidence if required.

## Test Plan

- Run strict documentation audit.
- Run pre-coding gate.
- Run deployment-readiness gate for TASK-001.
- Inspect git diff to verify runtime files were not changed by this task.

## Validation Plan

Validation succeeds when gate commands pass or any failure is documented with a concrete remediation. The final report must mention pre-existing unrelated modified Kubernetes files if they remain in the worktree.

## Gate Commands

```bash
python3 scripts/strict_doc_audit.py --format markdown --fail-on-issues
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root . --target TASK-001
```

## Documentation Updates

Update `README.md` documentation index and `TASKS.md` completion history if appropriate. Keep business intent unchanged.

## Rollback Plan

Remove the added IPS folders/scripts/package scripts from this task. Do not revert unrelated pre-existing Kubernetes changes.

## Agent Handoff Prompt

Implement the IPS baseline for `allegro-service` on the remote `alfares` repository using existing service documentation as source material. Do not change runtime service behavior. Run the IPS gates and report evidence, unresolved markers, and deviations.

## Completion Checklist

- [x] Implementation complete
- [x] Tests complete
- [x] Validation evidence collected
- [x] Documentation updated
- [x] Deviations documented
