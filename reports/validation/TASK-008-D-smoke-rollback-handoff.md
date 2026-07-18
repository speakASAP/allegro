# TASK-008-D Smoke And Rollback Handoff

```yaml
id: TASK-008-D-HANDOFF
status: draft
owner: Worker TASK-008-D
source_execution_plan: ../21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md
created: 2026-06-20
last_updated: 2026-06-20
sensitive_data_classification: synthetic
repo_path: /home/ssf/Documents/Github/allegro-service
branch: main
head_at_inspection: 4231950
```

## Scope

Planning-only handoff for deployment smoke and rollback readiness. This artifact is based on read-only inspection of the TASK-008 intent chain, deploy/readiness scripts, Kubernetes manifests, health endpoints, and current validation evidence. No deploy, shared gate run, manifest mutation, or source-code change was performed.

## Intent Preservation Traceability

- Vision: `../01_vision/VISION.md` [read indirectly through roadmap/execution-plan traceability only]
- Goal Impact: `../22_goal_impact/GOAL-IMPACT-TASK-008.md`
- System: `../04_systems/SYS-001-allegro-marketplace-integration.md`
- Feature: `../10_features/FEAT-008-operations-trust-and-scale.md`
- Task: `../11_tasks/TASK-008-plan-operations-trust-and-scale.md`
- Execution Plan: `../21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md`
- Coding Prompt: `[MISSING: TASK-008 approved coding prompt; execution-plan lane is still planning-only]`
- Code/runtime surfaces inspected: `scripts/deploy.sh`, `scripts/deployment_readiness_gate.py`, `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/ingress.yaml`, `services/allegro-service/src/health/health.controller.ts`, `shared/health/health.service.ts`, `package.json`
- Validation evidence inspected: `reports/validation/ips-deployment-readiness-gate.json`, `docs/12_validation/VAL-TASK-007-validation-report.md`, `docs/23_documentation_contracts/OPERATIONAL_GATE_STANDARD.md`, `docs/23_documentation_contracts/SENSITIVE_DATA_POLICY.md`

## Source-Backed Operational Facts

- `scripts/deploy.sh` performs four deploy phases only: preflight cluster/service health, manifest apply, rollout restart, rollout wait, and post-deploy pod listing.
- The deploy preflight blocks before apply when the namespace is missing, cluster connectivity fails, or existing `allegro-service` pods are already unhealthy.
- `k8s/deployment.yaml` defines `startupProbe`, `livenessProbe`, and `readinessProbe` against `GET /health` on container port `3403`.
- `k8s/service.yaml` exposes the workload on service port `3000` to target port `3403`.
- `k8s/ingress.yaml` routes `https://allegro.alfares.cz/` to the service; combined with the health controller, the expected external smoke path is `https://allegro.alfares.cz/health`.
- `services/allegro-service/src/health/health.controller.ts` returns a minimal JSON body with `status`, `service`, and `timestamp` only; there is no deeper dependency readiness route in the inspected repo.
- `package.json` keeps `npm run ips:readiness` pinned to `TASK-001`, so the generic npm alias is not task-correct for TASK-008 evidence.
- Current `reports/validation/ips-deployment-readiness-gate.json` is a pass report for `TASK-007`, not TASK-008.

## Deployment Smoke Checklist For TASK-008-E

### Pre-deploy evidence

1. Confirm repo state remains clean on `main` and record `git log -1 --oneline`.
2. Run task-scoped IPS commands explicitly, not the stale alias:
   - `npm run ips:audit`
   - `npm run ips:pre-coding`
   - `python3 scripts/deployment_readiness_gate.py --root . --target TASK-008`
3. Capture the resulting readiness report path and verify it references `TASK-008`, not `TASK-001` or `TASK-007`.
4. Record the current deployment image, pod names, and rollout revision before deploy:
   - `kubectl get deployment allegro-service -n statex-apps -o wide`
   - `kubectl get pods -n statex-apps -l app=allegro-service -o wide`
   - `kubectl rollout history deployment/allegro-service -n statex-apps`
5. Verify the current health baseline before mutation:
   - `kubectl get pods -n statex-apps -l app=allegro-service`
   - `kubectl logs -n statex-apps -l app=allegro-service --tail=100`
   - `curl -fsS https://allegro.alfares.cz/health`

### Deploy-path smoke

1. Run only the approved deploy entrypoint: `./scripts/deploy.sh`.
2. Preserve stdout/stderr from each deploy phase, especially preflight failures, `kubectl apply` output, `kubectl rollout restart`, and rollout wait timing.
3. If deploy completes, record:
   - `kubectl get pods -n statex-apps -l app=allegro-service -o wide`
   - `kubectl rollout status deployment/allegro-service -n statex-apps --timeout=180s`
   - `curl -fsS https://allegro.alfares.cz/health`
4. Treat any non-200 external health response, repeated pod restarts, failed rollout wait, or probe failure as a smoke failure.

### Post-deploy smoke acceptance

- External `https://allegro.alfares.cz/health` returns HTTP 200 and JSON body with `status: ok` and `service: allegro-service`.
- All `allegro-service` pods in `statex-apps` are `Running` and `Ready` with no fresh `CrashLoopBackOff`, `ImagePullBackOff`, or probe-flap symptoms.
- Rollout status reaches success within the bounded wait used by the deploy helper.
- No new secret-bearing or raw-production-data evidence is added to reports.

## Rollback Evidence Requirements

TASK-008-E should not claim rollback readiness without all of the following recorded in a validation artifact:

1. The last known good deployment revision from `kubectl rollout history deployment/allegro-service -n statex-apps`.
2. The image or manifest state running before the attempted deployment.
3. The exact failing phase: preflight, manifest apply, rollout restart, rollout wait, post-deploy smoke, or external health verification.
4. `kubectl describe pod` and `kubectl logs --tail=80` evidence for any unhealthy replacement pod, matching the failure branches already embedded in `scripts/deploy.sh`.
5. The exact rollback command chosen by the integration owner and why it matches the failure mode.
6. Confirmation after rollback of:
   - `kubectl rollout status deployment/allegro-service -n statex-apps --timeout=180s`
   - `kubectl get pods -n statex-apps -l app=allegro-service -o wide`
   - `curl -fsS https://allegro.alfares.cz/health`
7. Redaction confirmation that no secrets from `secret/prod/allegro-service`, OAuth tokens, JWTs, or raw customer/order data appear in the evidence.

## Deterministic Failure-Path Validation Steps

These are validation steps for TASK-008-E to execute or rehearse under approved deployment ownership. They are intentionally phase-specific so failures can be classified without guessing.

### Failure path A: task-scoped gate mismatch

- Run `npm run ips:readiness` and compare it to `python3 scripts/deployment_readiness_gate.py --root . --target TASK-008`.
- Expected result: the npm alias remains pointed at `TASK-001`; TASK-008 evidence must use the explicit Python command until the integration owner intentionally updates shared tooling.
- Classification: documentation/tooling mismatch, not deploy success evidence.

### Failure path B: preflight hard stop before mutation

- Observe `./scripts/deploy.sh` behavior when namespace access, cluster access, or pre-existing pod health is bad.
- Deterministic evidence commands:
  - `kubectl get namespace statex-apps`
  - `kubectl get nodes`
  - `kubectl get pods -n statex-apps -l app=allegro-service -o wide`
- Expected result: deploy exits before `kubectl apply` when any of those checks fail.
- Rollback implication: none, because no new manifests were applied yet.

### Failure path C: rollout or probe regression after apply

- After an approved deploy attempt, capture:
  - `kubectl rollout status deployment/allegro-service -n statex-apps --timeout=180s`
  - `kubectl describe pod -n statex-apps <new-pod>`
  - `kubectl logs -n statex-apps <new-pod> --tail=80`
  - `curl -fsS https://allegro.alfares.cz/health`
- Expected result: a failed rollout or non-200 health check is enough to trigger rollback planning.
- Rollback implication: record revision history first, then revert to last known good deployment state.

### Failure path D: false-positive internal readiness vs external ingress failure

- Compare pod readiness with external ingress health immediately after rollout success.
- Deterministic evidence commands:
  - `kubectl get pods -n statex-apps -l app=allegro-service`
  - `curl -fsS https://allegro.alfares.cz/health`
- Expected result: internal pod readiness can pass while external ingress/TLS/routing still fails.
- Rollback implication: classify whether the fault is service-only or ingress-path related before reverting the application deployment.

## Blockers And Gaps

- [MISSING: task-scoped TASK-008 validation artifact or gate report. The checked-in readiness JSON currently targets TASK-007 only.]
- [MISSING: repo-local rollback playbook or approved rollback command for `allegro-service` beyond generic roadmap language about rollback steps.]
- [MISSING: deeper application readiness endpoint covering dependencies such as database, Allegro OAuth state, queue health, or downstream integrations; only shallow `/health` is present in inspected code.]
- [MISSING: explicit smoke evidence contract for ingress/TLS verification output location under `12_validation` or `reports/validation` for TASK-008-E closure.]
- [UNKNOWN: whether rollout history is sufficient on this cluster for every rollback scenario or whether image-tag pinning/manifests outside this repo are required.]
- [UNKNOWN: whether external health smoke should be executed from the cluster, from the Alfares host, or from a public network vantage point to validate ingress/TLS fully.]

## Readiness Judgment For Integration

TASK-008-D is ready for TASK-008-E integration as a planning handoff only. It is not sufficient to claim deployment-readiness closure yet because TASK-008-specific gate evidence, a concrete rollback command/runbook, and a deeper readiness signal are still missing.
