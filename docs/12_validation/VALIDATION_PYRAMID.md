# Validation Pyramid

```yaml
id: VALIDATION-PYRAMID-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../01_vision/VISION.md
  - ../04_systems/SYS-001-allegro-marketplace-integration.md
downstream:
  - ./VAL-TASK-001-ips-baseline.md
related_adrs: []
```

## Purpose

Define the validation layers used by `allegro-service` under IPS.

## Layers

| Layer | Evidence |
|---|---|
| Documentation audit | `scripts/strict_doc_audit.py` output |
| Pre-coding gate | `reports/validation/ips-pre-coding-gate.json` |
| Deployment-readiness gate | `reports/validation/ips-deployment-readiness-gate.json` |
| Task validation | `docs/12_validation/VAL-*.md` reports |
| Runtime tests | Service-specific tests or operational checks identified by execution plans |

## Validation

Every task must identify which layers apply and record evidence before closure.
