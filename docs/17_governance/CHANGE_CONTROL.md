# Change Control

```yaml
id: CHANGE-CONTROL-ALLEGRO-SERVICE
status: draft
owner: Project Owner
created: 2026-06-13
last_updated: 2026-06-13
completeness_level: complete
upstream:
  - ../00_constitution/CONSTITUTION.md
  - ../01_vision/VISION.md
downstream:
  - ./AI_AGENT_RULES.md
related_adrs: []
```

## Protected Documents

- `../00_constitution/CONSTITUTION.md`
- `../01_vision/VISION.md`

## Change Categories

- Minor documentation clarification: reviewer approval.
- Major documentation or architecture change: owner approval and ADR when applicable.
- Vision change: human-approved vision evolution entry.
- Runtime integration change: execution plan, tests, validation report, and readiness gate.

## AI Role

AI may draft changes and identify gaps. AI must not approve business intent changes or silently modify protected documents.

## Validation

Protected document changes are checked by deployment-readiness gate using Git diff.
