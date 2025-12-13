## Execution Plan for Allegro Import Issues

### Objectives

- Diagnose and resolve dashboard import page issues (500 on `/import/jobs`, OAuth/authorization errors, slow loading, export errors, wrong currency display).
- Collect evidence from production logs and configuration (`.env`) to confirm runtime settings.
- Ensure fixes respect `.env` as source of truth and centralized logging.

### Plan

1. Gather environment/config
   - SSH to prod and read `.env` (`ssh statex "cd allegro && cat .env"`) to verify API_GATEWAY/IMPORT/ALLEGRO URLs, timeouts, DB connection, currency targets.
   - Note any missing keys for `.env.example` (names only, no secrets).
2. Collect production logs around failures
   - Check API Gateway logs for `/api/import/jobs` 500s.
   - Check imports logs for errors on `/import/jobs`.
   - Check allegro-service logs for OAuth/access-denied on preview/import/export.
3. Reproduce locally (if needed)
   - Ensure `shared` built and services running.
   - Hit `/api/import/jobs` and import/preview/export endpoints to confirm behavior with current code.
4. Backend fixes: import jobs 500 and performance
   - Add safe error handling and pagination/limits in `imports` list path if needed.
   - Ensure Prisma query uses numeric pagination and guards null values; add logging context.
   - Consider adding index usage or limit to 100 and default sort; verify DB connectivity.
5. Backend fixes: Allegro OAuth/credentials
   - Confirm Sales Center and Allegro preview/import use OAuth token; avoid falling back to client_credentials for user offers.
   - Improve user-facing errors for OAuth vs credentials; ensure status codes meaningful.
6. Frontend fixes: UX and currency
   - Fix currency display in import/export preview to use backend-provided currency (default to CZK for Allegro or value from data) and avoid hardcoded PLN.
   - Clear preview state after successful import so items disappear and button disables/reset.
   - Improve loading/error messages to reflect OAuth-required state distinctly.
7. Backend/Frontend fixes: export error flow
   - Handle blob/download error path and surface backend message; ensure gateway returns correct status/content-type.
8. Logging and monitoring
   - Ensure added logs use central logger; include request IDs/service names.
9. Testing
   - Manual: `/import/jobs`, preview/import (Allegro & Sales Center), export, currency display, post-import state cleared.
   - If time: add/adjust existing tests relevant to touched code.

### Checklist (to execute after approval)

1. SSH to prod and read `.env`; record relevant keys (names only) and values needed for debugging.
2. Collect prod logs for API Gateway, imports, allegro-service around `/import/jobs`, preview/import/export.
3. (If needed) Start local services and reproduce `/import/jobs` and import flows.
4. Patch imports: harden `/import/jobs` (validation, safe pagination, error handling, logging).
5. Patch allegro-service: ensure Sales Center and preview/import use OAuth token; improve error messages; avoid client_credentials where not allowed.
6. Patch frontend ImportJobsPage: currency display uses data; clear preview after import; disable Import button appropriately; better error/OAuth prompts; handle export errors gracefully.
7. Update `.env.example` with any missing non-secret keys identified; back up `.env` before any edits (if required).
8. Run tests/manual verification for `/import/jobs`, previews/imports, exports, currency display, post-import UI reset.
9. Re-check logs for errors after fixes (local) and note follow-up steps for prod deploy.
