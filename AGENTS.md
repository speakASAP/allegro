# Repository Agent Instructions

Shared rules live here:

- Codex profile: `/home/ssf/.codex/AGENTS.md`
- Cross-agent standard: `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- Repository operations: `AGENT_OPERATIONS.md`

Read those first, then follow the repository-specific notes below and the current planning/status files.


## Repository-Specific Notes

---

# Agents: allegro-service

No autonomous AI agents. Offer sync and order forwarding are rule-based.

## Active Agents
<!-- Coordinator-maintained -->
None.

# AGENTS.md

## Required reading
- intent-preservation-system docs and validator files
- SYSTEM.md, BUSINESS.md, TASKS.md, and STATE.json

## Authority
This repository is operated under the shared Alfares control model. Agents may work within the approved project scope, but they must not invent runtime contracts, user claims, marketplace workflows, or approval evidence.

## Intent preservation system
The IPS lives in the central intent-preservation-system repository. This repo keeps project-specific runtime intent and operational evidence locally while reusing the standard validators and templates for traceability.

## Safety and operations
- do not fabricate ecosystem dependencies or service routes
- do not overwrite human-authored business or constitutional intent without explicit approval
- preserve traceability from goals to tasks to validation evidence
- prefer truthful not-applicable decisions over invented runtime dependencies

## Project-specific rules
- Allegro must remain honest about the real marketplace integration boundaries and not invent payments or invoice ownership
- stock.updated is a real dependency and must be documented as the authoritative event contract
- orders must be forwarded to the orders service rather than treated as local business ownership

## Required final report
The final response must include: role performed, files changed, documents created, validation commands and results, validation debt created or used, active blockers, deviations from scope, and a final Next step: line.
