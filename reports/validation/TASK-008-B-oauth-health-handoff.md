# TASK-008-B OAuth Health Handoff

## Intent Preservation Chain

- Vision: `docs/01_vision/VISION.md` [MISSING: not re-opened in this lane; upstream traceability inherited from TASK-008 execution plan]
- Goal Impact: `docs/22_goal_impact/GOAL-IMPACT-TASK-008.md`
- System: `[MISSING: no system artifact was opened in this lane]`
- Feature: `docs/10_features/FEAT-008-operations-trust-and-scale.md`
- Task: `docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md`
- Execution Plan: `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md`
- Coding Prompt: `[MISSING: TASK-008 remains draft and this lane is handoff-only]`
- Code: inspected only; no runtime code changed
- Validation: secret-safe handoff plus targeted read-only scans

## Lane Scope

TASK-008-B covers OAuth token lifecycle, expiry handling, refresh behavior, operator-visible status, and secret-safe monitoring signals for `allegro-service`. This is a planning-only artifact for TASK-008-E integration. No runtime code, shared validation reports, deploy scripts, manifests, or state files were changed.

## Source Evidence Reviewed

- `docs/08_roadmap/ROADMAP.md`
- `docs/09_milestones/MS-007-operations-trust-and-scale.md`
- `docs/10_features/FEAT-008-operations-trust-and-scale.md`
- `docs/11_tasks/TASK-008-plan-operations-trust-and-scale.md`
- `docs/16_operations/INTEGRATIONS.md`
- `docs/17_governance/PROJECT_INVARIANTS.md`
- `docs/21_execution_plans/EP-TASK-008-plan-operations-trust-and-scale.md`
- `services/allegro-service/src/allegro/allegro-auth.service.ts`
- `services/allegro-service/src/allegro/allegro-oauth.service.ts`
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`
- `services/allegro-service/src/allegro/allegro-api.service.ts`
- `services/allegro-service/src/allegro/offers/offers.service.ts`
- `services/allegro-service/src/allegro/policy/policy-engine.service.ts`
- `services/allegro-service/src/allegro/catalog-sell-action/catalog-sell-action.service.ts`
- `shared/notifications/notification.service.ts`

## Traceability Summary

- Roadmap Stage 6 requires OAuth expiry and refresh monitoring plus notifications.
- `FEAT-008` requires OAuth expiry and refresh risks to be visible.
- `TASK-008` requires OAuth risks to be alertable and evidence to stay synthetic.
- `EP-TASK-008` defines this lane as handoff-only and reserves shared validation/gate ownership for TASK-008-E.
- `PROJECT_INVARIANTS.md` and `INTEGRATIONS.md` require secret-safe handling for OAuth credentials and operational alerts.

## Source-Backed OAuth Lifecycle Map

1. Authorization bootstrap
   `oauth.controller.ts` `GET /allegro/oauth/authorize` requires an owned account, checks `clientId`, normalizes `ALLEGRO_REDIRECT_URI`, generates PKCE + state, and stores `oAuthState` plus encrypted `oAuthCodeVerifier`.
2. Callback exchange
   `GET /allegro/oauth/callback` looks up the account by stored state, validates state equality, decrypts the stored verifier and client secret, exchanges the code through `AllegroOAuthService.exchangeCodeForToken()`, encrypts returned tokens, persists `tokenExpiresAt` and `tokenScopes`, then clears transient state fields.
3. Runtime token acquisition
   `AllegroAuthService.getUserAccessTokenForAccount()` loads the requested account, requires `accessToken`, checks `tokenExpiresAt` with a 5-minute buffer, refreshes when expiry is near, and otherwise decrypts the stored token.
4. Refresh lifecycle
   `refreshUserTokenForAccount()` requires stored `refreshToken`, `clientId`, and decryptable `clientSecret`, calls `refreshAccessToken()`, then rewrites encrypted tokens and `tokenExpiresAt`.
5. Readiness gating
   `policy-engine.service.ts` and `catalog-sell-action.service.ts` already surface `tokenExpiresAt` and block account readiness when the token is missing or expired.
6. Operator visibility
   `GET /allegro/oauth/status` returns only `authorized`, `expiresAt`, and `scopes`; `POST /allegro/oauth/revoke` clears token/state fields.
7. Notification capability
   `shared/notifications/notification.service.ts` has generic email/sync-error delivery plumbing, but no OAuth-specific alert contract was found in this lane.

## OAuth Risk Map

| Risk area | Source-backed evidence | Operational impact | Secret-safe signal or alert candidate |
| --- | --- | --- | --- |
| Expiry drift | `tokenExpiresAt` persisted and checked in auth, policy, and account-choice paths. | Publish/import/sync flows can fail only when a live operation asks for a token. | Gauge `oauth_token_expiry_seconds{account_id}` and warning/critical thresholds. |
| Refresh dependency gap | Refresh path throws when `refreshToken`, `clientId`, or decryptable `clientSecret` is missing. | Active account becomes re-authorization-only instead of auto-recovering. | Counter `oauth_refresh_failures_total{reason}` with reason classes for missing refresh token, missing credentials, decrypt failure, upstream reject. |
| Callback state / PKCE mismatch | Callback path depends on matching `oAuthState` and decryptable `oAuthCodeVerifier`. | Re-authorization loops can fail before tokens are stored. | Counter `oauth_callback_failures_total{reason}` for `missing_parameters`, `invalid_state`, `state_mismatch`, `decryption_failed`, `exchange_failed`. |
| Late discovery during business flows | `offers.service.ts` catches 401/403 and retries through token acquisition or asks for re-authorization. | OAuth issues first appear during imports, publish attempts, or clone flows rather than in a proactive health signal. | Counter `oauth_runtime_reauth_required_total{path}` plus `oauth_api_401_403_total{operation}`. |
| Redaction debt in logging | `oauth.controller.ts`, `allegro-oauth.service.ts`, `allegro-api.service.ts`, and `offers.service.ts` log state/code previews, token previews, first chars, or encryption-key fragments. | OAuth health evidence can itself violate ALG-INV-004 and leak credentials or secrets. | Treat any preview-style token/state/secret logging match as a redaction-violation metric and release blocker for readiness claims. |
| Secret-sprawl around environment artifacts | Repo currently tracks `.env`, `.env.backup`, and `.env.backup-20260415T141408Z-unified-payments`. Contents were not opened in this lane. | Secret hygiene risk extends beyond runtime refresh logic into repo-level evidence handling. | Mark as blocker-level governance finding; do not ingest these files into any monitoring or evidence workflow. |
| Alert delivery contract missing | Notification plumbing exists, but no OAuth-specific DTO or handler was found. | Detection may exist before routing/ownership for operator action exists. | `[MISSING: approved OAuth alert routing contract]` before TASK-008-E claims end-to-end alertability. |

## Alert Candidates For TASK-008-E

### Minimum metric set

- `oauth_authorized_accounts_total`
  Count active Allegro accounts with stored access tokens.
- `oauth_token_expiry_seconds`
  Per-account gauge from `tokenExpiresAt - now`.
- `oauth_refresh_attempts_total{result}`
  Result labels: `success`, `failure`.
- `oauth_refresh_failures_total{reason}`
  Reason labels: `missing_refresh_token`, `missing_client_credentials`, `decrypt_failed`, `upstream_rejected`, `unknown`.
- `oauth_callback_failures_total{reason}`
  Reason labels from callback failure categories above.
- `oauth_runtime_reauth_required_total{path}`
  Path labels such as `offer_import`, `sales_center_import`, `publish`, `clone`.
- `oauth_api_401_403_total{operation}`
  Operation labels for upstream Allegro calls that indicate auth trouble.
- `oauth_redaction_violation_matches_total{surface}`
  Surface labels like `oauth_controller`, `oauth_service`, `api_service`, `offers_service`.

### Suggested alert thresholds

- Warning: active account token expires within 15 minutes.
- Critical: active account token expires within 5 minutes or is already expired.
- Warning: 2 or more refresh failures for the same active account within 15 minutes.
- Critical: refresh failures persist for the same active account for 30 minutes.
- Warning: callback failures spike for `invalid_state` or `state_mismatch`.
- Critical: any redaction-violation match appears in release validation for OAuth surfaces.

## Redaction-Safe Evidence Plan

Allowed evidence:

- Account metadata only: `accountId`, `isActive`, `authorized`, `expiresAt`, scope count, scope category if approved.
- Refresh attempt metadata: timestamp, account id, duration, outcome, reason class, new-refresh-token-present boolean.
- Callback metadata: outcome category, normalized redirect host or hash, state validation outcome, no raw state/code/verifier.
- Runtime auth failure metadata: operation, status family, refresh-attempted boolean, retry outcome, remediation category.
- Secret-scan evidence: offending file path + line number + rule name only, never copied secret-like text.

Disallowed evidence:

- Raw access tokens, refresh tokens, code verifier values, state values, auth headers, client secrets, `.env` contents, token previews, token first/last chars, or copied production OAuth logs.

## Deterministic Validation Ideas

1. Healthy token metadata case
   Synthetic account has future `tokenExpiresAt`; expect `authorized=true`, no refresh signal, no alert.
2. Near-expiry warning case
   Synthetic account has `tokenExpiresAt` within 15 minutes; expect warning threshold only.
3. Auto-refresh success case
   Synthetic account enters the 5-minute buffer and refresh succeeds; expect success counter and forward-shifted expiry.
4. Missing refresh token case
   Synthetic account expires with no stored refresh token; expect `missing_refresh_token` classification and re-authorization requirement.
5. Client secret decrypt failure case
   Simulated decrypt failure in callback or refresh path; expect `decrypt_failed` classification without exposing ciphertext or key material.
6. State mismatch case
   Synthetic callback sends non-matching state; expect `state_mismatch`, no token persistence, and no raw state in evidence.
7. Upstream reject case
   Mock Allegro refresh/token exchange returns 400/401; expect `upstream_rejected` and operator re-authorization guidance.
8. Runtime 401/403 recovered case
   Operation sees auth failure, refresh retry succeeds, and recovery is recorded without token preview output.
9. Runtime 401/403 unrecovered case
   Operation sees auth failure and refresh retry fails; expect `oauth_runtime_reauth_required_total` increment.
10. Redaction debt scan case
    Pattern scan matches preview-style token/state/secret logging; expect blocker evidence with file and line only.

## Readiness For TASK-008-E Integration

Ready for TASK-008-E integration as a planning handoff only.

Why this lane is ready:

- OAuth lifecycle ownership and persistence points are concrete in repo code.
- Existing policy/account-readiness checks provide stable source anchors for alert thresholds.
- The lane can hand off metrics, alert classes, and deterministic validation ideas without touching shared artifacts.

Why the overall OAuth health story is not ready for closure yet:

- Secret-safe observability is incomplete because current code contains multiple preview-style logging patterns.
- No approved OAuth-specific alert-routing contract was found.
- Repo-tracked environment artifacts create governance risk even before runtime monitoring is added.

## Explicit Blockers

- [MISSING: approved destination and schema for OAuth operational metrics or dashboards]
- [MISSING: approved OAuth alert-routing contract using `notifications-microservice` or another owner]
- [MISSING: task-scoped synthetic test harness or validation artifact for OAuth failure injection]
- [MISSING: owner-approved remediation plan for preview-style token/state/secret logging across OAuth surfaces]
- [UNKNOWN: whether `tokenScopes` may be shown verbatim to operators or must be reduced to counts/categories]
- [UNKNOWN: whether the tracked `.env` and backup env files still contain active credentials]

## TASK-008-E Integration Notes

- Merge this handoff with TASK-008-A so account-aware rate-limit controls and OAuth expiry alerts share the same account dimension.
- Merge with TASK-008-D so release smoke/readiness checks fail fast on redaction-violation matches before any production readiness claim.
- Keep all future OAuth evidence metadata-only until a formal alerting and reporting contract is approved.
