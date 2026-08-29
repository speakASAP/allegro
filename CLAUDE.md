# Claude Instructions

Shared rules live here:

- Claude profile: `/home/ssf/.claude/CLAUDE.md`
- Shared ecosystem instructions: `/home/ssf/Documents/Github/CLAUDE.md`
- Codex profile: `/home/ssf/.codex/AGENTS.md`
- Cross-agent standard: `/home/ssf/.ai-agent-standards/CROSS_AGENT_AUTOMATION_STANDARD.md`
- Repository operations: `AGENT_OPERATIONS.md`

Read those first, then follow the repository-specific notes below and the current planning/status files.


## Repository-Specific Notes

# CLAUDE.md (allegro-service)

→ Ecosystem: [../shared/CLAUDE.md](../shared/CLAUDE.md) | Reading order: `BUSINESS.md` → `SYSTEM.md` → `AGENTS.md` → `TASKS.md` → `STATE.json`

---

## Knowledge Retrieval

Use `docs-rag-microservice` for bounded discovery when it is healthy, then
verify deployment, security, database, integration and public-contract facts
against the cited Git source. Git remains authoritative.

Authority and fallback rules:
`/home/ssf/Documents/Github/shared/docs/DOCUMENTATION_AUTHORITY.md`.

Do not generate tokens in documentation or assume an unconfident/failed RAG
response means that source documentation does not exist.

## allegro-service

**Purpose**: Multi-account Allegro.pl marketplace integration — offer management, CSV import/transformation, order processing, stock sync.  
**Domain**: <https://allegro.alfares.cz>
**Stack**: NestJS · PostgreSQL

### Key constraints

- Never create or modify Allegro offers without validation against catalog-microservice
- Allegro API rate limit: max 1 request/second per account — enforce strictly
- All received orders must be forwarded to orders-microservice — never stored locally
- Allegro OAuth tokens in Vault/`.env` only — never hardcoded

### Events consumed

- `stock.updated` from warehouse-microservice → updates Allegro offer quantities

### Integration chain

catalog-microservice → allegro-service → Allegro API  
warehouse-microservice → (stock.updated) → allegro-service

**Ops**: `kubectl logs -n statex-apps -l app=allegro-service -f` · `kubectl rollout restart deployment/allegro-service -n statex-apps` · `./scripts/deploy.sh`

### Secrets

All secrets in Vault (`secret/prod/allegro-service`) → ESO → K8s Secret `allegro-service-secret`.
