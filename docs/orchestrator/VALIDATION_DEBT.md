# Validation Debt Ledger

## Purpose
Record known validation issues that are not caused by the current task so work can separate historical debt from current-task regressions.

## Rules
- this ledger does not excuse current-task failures
- each entry requires an owner, scope, and unblock condition
- do not record secrets, tokens, raw production data, customer identifiers, or private evidence
- if a failure starts affecting the current task, promote it from debt to blocker

## Entries

| ID | Date | Command | Failure Summary | Scope | Owner | Blocks Current Task? | Unblock Condition | Evidence |
|---|---|---|---|---|---|---|---|---|
| VD-001 | 2026-06-13 | IPS planning validation | No repo-local validation debt identified for the current Allegro adoption task. | repo-specific | project owner | no | maintain the current contract and validation evidence | repository adoption profile |

## Update format
- issue, affected artifact, owner, and required follow-up action
- tag as current-task blocking or pre-existing debt

## Current-task decision checklist
- Does the failing command touch files changed by this task?
- Does the failure mention this task ID, goal ID, or changed module?
- Is the failure already listed above with `Blocks Current Task? = no`?
- Did the failure exist before this task started?
- Is the validation command required by the current task acceptance criteria?

## Agent reporting format

```text
Validation debt check:
- Command:
- Result:
- Matched ledger entry:
- Current-task impact:
- Next action:
```
