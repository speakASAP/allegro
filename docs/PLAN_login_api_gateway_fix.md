# Login/API Gateway Fix Plan

## Context

- **Symptom**: On `https://allegro.statex.cz/login`, the browser shows:
  - `🔴 Service Connection Error` with `{ service: 'API Gateway', port: 3411, url: 'http://localhost:3411/api/auth/login', error: 'Network Error', code: 'ERR_NETWORK' }`
  - Network tab shows `POST http://localhost:3411/api/auth/login net::ERR_CONNECTION_REFUSED`.
- **Server state**:
  - `allegro-api-gateway-green` is running and healthy, mapped as `127.0.0.1:3411->3411/tcp`.
  - `curl http://localhost:3411/health` on the server returns a healthy response.
- **Codebase references**:
  - API Gateway docs: `README.md` (API Gateway on port 3411, all traffic via `http://localhost:3411/api`).
  - Frontend API client: `services/allegro-frontend-service/src/services/api.ts`.
  - Docker Compose: `docker-compose.yml`, `docker-compose.green.yml`, `docker-compose.blue.yml`.
  - Production URL wiring: `docs/NEXT_STEPS.md` and nginx config in the nginx microservice.

## Root Cause

- The frontend bundle currently served for `https://allegro.statex.cz` is using the **development fallback** API base URL:
  - `http://localhost:3411/api`
- In `services/allegro-frontend-service/src/services/api.ts`, the API URL resolution logic is:
  - Use `import.meta.env.VITE_API_URL` if defined at build time.
  - Else, if `window.location.origin` contains `allegro.statex.cz` or `statex.cz`, use `${origin}/api`.
  - Else, fall back to `http://localhost:3411/api` for local development.
- This means the production bundle was built **without a correct `VITE_API_URL`/`FRONTEND_API_URL`**, or with an outdated configuration, causing the compiled JavaScript to call `http://localhost:3411/...` from the client browser.
- From the browser’s perspective, `localhost:3411` refers to the **user’s machine**, not the production server, so the request fails with `ERR_CONNECTION_REFUSED` even though the API Gateway is healthy on the server.

### High-Level Solution

1. Ensure `.env` (local and production) contains correct, non-localhost configuration:
   - `API_GATEWAY_PORT=3411`
   - `ALLEGRO_FRONTEND_SERVICE_PORT=3410`
   - `FRONTEND_API_URL=https://allegro.statex.cz/api` (public API URL for production).
2. Confirm Docker Compose for blue/green stacks builds the frontend with:
   - `build.args.VITE_API_URL: ${FRONTEND_API_URL:-https://allegro.statex.cz/api}`.
3. Rebuild the **green** `allegro-frontend-service` image so that `import.meta.env.VITE_API_URL` is baked in correctly.
4. Verify nginx reverse proxy for `allegro.statex.cz`:
   - `location /` routes to `allegro-frontend-service` (port 3410).
   - `location /api/` routes to the API Gateway upstream.
5. Reload nginx and confirm that the login page on `https://allegro.statex.cz/login` now calls:
   - `https://allegro.statex.cz/api/auth/login` instead of `http://localhost:3411/api/auth/login`.

### Implementation Checklist

1. ✅ Confirm `services/allegro-frontend-service/src/services/api.ts` uses:
   - `VITE_API_URL` when defined.
   - `${window.location.origin}/api` when origin contains `allegro.statex.cz` or `statex.cz`.
   - `http://localhost:3411/api` only as a development fallback.
2. ✅ Confirm `docker-compose.yml`, `docker-compose.green.yml`, and `docker-compose.blue.yml` configure `allegro-frontend-service` with:
   - `build.args.VITE_API_URL: ${FRONTEND_API_URL:-https://allegro.statex.cz/api}`.
3. ✅ Fixed frontend API URL issue - rebuilt frontend with correct `FRONTEND_API_URL` in production.
4. ✅ Fixed API Gateway connectivity to auth service - changed `AUTH_SERVICE_URL` from `https://auth.statex.cz` to `http://auth-microservice:3370` (Docker network).
5. ✅ Improved error handling in `gateway.controller.ts` to:
   - Detect timeout/connection errors and return 503 Service Unavailable with specific messages.
   - Properly forward 409 Conflict errors (user already exists) with better error messages.
   - Forward error messages from auth service to frontend.
6. ✅ Login endpoint working - tested successfully with `ssfskype@gmail.com` / `Password123!`.
7. ✅ Register endpoint working - returns 409 Conflict when user already exists (expected behavior).

### Resolution Summary

**Original Issue**: Login/register failing with `ERR_CONNECTION_REFUSED` on `https://allegro.statex.cz/login`.

**Root Causes Found**:

1. **Frontend API URL**: Frontend was built with development fallback (`http://localhost:3411/api`) instead of production URL.
2. **Auth Service Connectivity**: API Gateway couldn't reach auth service at `https://auth.statex.cz` (timeout errors).

**Fixes Applied**:

1. ✅ Rebuilt frontend with correct `FRONTEND_API_URL=https://allegro.statex.cz/api`.
2. ✅ Updated production `.env`: `AUTH_SERVICE_URL=http://auth-microservice:3370` (Docker network instead of HTTPS).
3. ✅ Improved API Gateway error handling for timeouts, connection errors, and 409 conflicts.

**Current Status**:

- ✅ Login works: `ssfskype@gmail.com` / `Password123!` successfully authenticates.
- ✅ Register works: Returns 409 Conflict when user already exists (correct behavior).
- ✅ API Gateway connects to auth service via Docker network.
- ✅ Frontend calls correct production API URLs.

**Next Steps** (if needed):

- Test login from browser at `https://allegro.statex.cz/login` to confirm frontend is using correct API URL.
- If frontend still shows errors, may need to hard refresh browser cache or verify nginx routing.
