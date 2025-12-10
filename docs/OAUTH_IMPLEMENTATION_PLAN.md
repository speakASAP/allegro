# OAuth Authorization Code Flow Implementation Plan

## Overview

This plan details the implementation of OAuth 2.0 Authorization Code Flow with PKCE for Allegro API integration. This will replace the current `client_credentials` grant type for accessing user-specific resources like `/sale/offers`.

## Current State

- **Current Authentication**: Uses `client_credentials` grant type
- **Limitation**: `client_credentials` only provides access to public endpoints, not user-specific resources
- **Error**: 403 Forbidden when accessing `/sale/offers` endpoint
- **Storage**: User credentials (Client ID, Client Secret) stored in `user_settings` table (encrypted)

## Target State

- **OAuth Flow**: Full OAuth 2.0 Authorization Code Flow with PKCE
- **User Authorization**: Users authorize the application via Allegro's authorization page
- **Token Storage**: Store access tokens, refresh tokens, and expiration times per user
- **Token Refresh**: Automatic token refresh before expiration
- **Backward Compatibility**: Support both OAuth tokens and client credentials (for public endpoints)

## Implementation Checklist

### Phase 1: Database Schema Updates

1. **Update Prisma Schema** (`prisma/schema.prisma`)
   - Add OAuth token fields to `UserSettings` model:
     - `allegroAccessToken` (String?, encrypted)
     - `allegroRefreshToken` (String?, encrypted)
     - `allegroTokenExpiresAt` (DateTime?)
     - `allegroTokenScopes` (String?) - Store granted scopes
     - `allegroOAuthState` (String?) - For OAuth state verification
     - `allegroOAuthCodeVerifier` (String?, encrypted) - For PKCE
   - Run migration: `npx prisma migrate dev --name add_allegro_oauth_tokens`

2. **Update Settings DTOs** (`services/allegro-settings-service/src/settings/dto/update-settings.dto.ts`)
   - Add optional fields for OAuth tokens in `UpdateSettingsDto`
   - Create new DTOs:
     - `AllegroOAuthCallbackDto` - For OAuth callback
     - `AllegroOAuthStatusDto` - For checking OAuth status

### Phase 2: Backend - OAuth Service

3. **Create OAuth Service** (`services/allegro-service/src/allegro/allegro-oauth.service.ts`)
   - Implement methods:
     - `generateAuthorizationUrl(userId: string, clientId: string, redirectUri: string): { url: string, state: string, codeVerifier: string }`
     - `exchangeCodeForToken(code: string, codeVerifier: string, redirectUri: string, clientId: string, clientSecret: string): TokenResponse`
     - `refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): TokenResponse`
     - `validateState(state: string, storedState: string): boolean`
   - Implement PKCE:
     - Generate `code_verifier` (random string, 43-128 chars)
     - Generate `code_challenge` (SHA256 hash of verifier, base64url encoded)
     - Use `code_challenge_method=S256`

4. **Update Allegro Auth Service** (`services/allegro-service/src/allegro/allegro-auth.service.ts`)
   - Add method: `getUserAccessToken(userId: string): Promise<string>`
     - Check if token exists and is valid (not expired)
     - If expired, refresh using refresh token
     - If no token or refresh fails, throw error indicating OAuth needed
   - Add method: `refreshUserToken(userId: string): Promise<string>`
   - Update `getAccessTokenWithCredentials` to support both:
     - OAuth tokens (preferred for user resources)
     - Client credentials (fallback for public endpoints)
   - Add token expiration checking logic

5. **Update Settings Service** (`services/allegro-settings-service/src/settings/settings.service.ts`)
   - Add methods:
     - `storeAllegroOAuthTokens(userId: string, tokens: TokenResponse, scopes?: string): Promise<void>`
     - `getAllegroOAuthStatus(userId: string): Promise<{ authorized: boolean, expiresAt?: Date, scopes?: string }>`
     - `revokeAllegroOAuth(userId: string): Promise<void>` - Clear OAuth tokens
   - Update encryption/decryption to handle OAuth tokens
   - Update `getSettings` to include OAuth status (but not tokens)

### Phase 3: Backend - OAuth Endpoints

6. **Create OAuth Controller** (`services/allegro-service/src/allegro/oauth/oauth.controller.ts`)
   - `GET /allegro/oauth/authorize` - Generate authorization URL
     - Requires JWT auth
     - Returns: `{ authorizationUrl: string, state: string }`
   - `GET /allegro/oauth/callback` - Handle OAuth callback
     - Public endpoint (no JWT required)
     - Validates state parameter
     - Exchanges code for tokens
     - Stores tokens in database
     - Redirects to frontend success page
   - `GET /allegro/oauth/status` - Check OAuth authorization status
     - Requires JWT auth
     - Returns: `{ authorized: boolean, expiresAt?: Date, scopes?: string }`
   - `POST /allegro/oauth/revoke` - Revoke OAuth authorization
     - Requires JWT auth
     - Clears stored tokens

7. **Update API Gateway** (`services/api-gateway/src/gateway/gateway.controller.ts`)
   - Add route: `@All('allegro/oauth/*')` - Route OAuth endpoints
   - Note: `/allegro/oauth/callback` should be public (no auth guard)

8. **Update Offers Service** (`services/allegro-service/src/allegro/offers/offers.service.ts`)
   - Update `previewOffersFromAllegro` to use OAuth tokens:
     - Try to get user's OAuth token first
     - Fall back to client credentials if OAuth not available
     - Provide clear error if OAuth required but not authorized

### Phase 4: Frontend - OAuth UI

9. **Update Settings Page** (`services/allegro-frontend-service/src/pages/SettingsPage.tsx`)
   - Add OAuth section:
     - Show OAuth authorization status
     - "Authorize with Allegro" button (if not authorized)
     - "Revoke Authorization" button (if authorized)
     - Display token expiration date and scopes
   - Add state management for OAuth status
   - Add handler: `handleAuthorizeAllegro()` - Calls `/api/allegro/oauth/authorize` and redirects
   - Add handler: `handleRevokeAllegro()` - Calls `/api/allegro/oauth/revoke`

10. **Create OAuth Callback Page** (`services/allegro-frontend-service/src/pages/AllegroOAuthCallbackPage.tsx`)
    - Handle OAuth callback redirect
    - Extract `code` and `state` from URL
    - Call backend `/api/allegro/oauth/callback?code=...&state=...`
    - Show success/error message
    - Redirect to Settings page after 3 seconds

11. **Update App Router** (`services/allegro-frontend-service/src/App.tsx`)
    - Add route: `/auth/callback` -> `AllegroOAuthCallbackPage`

12. **Update API Service** (`services/allegro-frontend-service/src/services/api.ts`)
    - Add methods:
      - `getAllegroOAuthStatus()` - Get OAuth status
      - `authorizeAllegro()` - Get authorization URL
      - `revokeAllegroOAuth()` - Revoke authorization

### Phase 5: Environment Variables

13. **Update .env.example**
    - Add:
      - `ALLEGRO_REDIRECT_URI` - OAuth redirect URI (e.g., `http://localhost:3410/auth/callback` for dev, `https://allegro.statex.cz/auth/callback` for prod)
      - `ALLEGRO_OAUTH_AUTHORIZE_URL` - Allegro authorization URL (default: `https://allegro.pl/auth/oauth/authorize`)
      - `ALLEGRO_OAUTH_TOKEN_URL` - Allegro token URL (default: `https://allegro.pl/auth/oauth/token`)

14. **Update Documentation**
    - Update `README.md` with OAuth configuration
    - Update `docs/LOCAL_DEV_SETUP.md` with OAuth setup instructions

### Phase 6: Error Handling & Logging

15. **Update Error Messages**
    - Update `offers.controller.ts` error messages to guide users to OAuth authorization
    - Add specific error codes:
      - `OAUTH_REQUIRED` - OAuth authorization needed
      - `OAUTH_EXPIRED` - OAuth token expired, refresh needed
      - `OAUTH_REFRESH_FAILED` - Token refresh failed, re-authorization needed

16. **Add Logging**
    - Log OAuth authorization attempts
    - Log token refresh operations
    - Log OAuth errors (without exposing tokens)

### Phase 7: Testing

17. **Unit Tests**
    - Test OAuth service methods
    - Test token refresh logic
    - Test PKCE generation and validation
    - Test state validation

18. **Integration Tests**
    - Test full OAuth flow (mock Allegro API)
    - Test token refresh flow
    - Test error scenarios (expired tokens, invalid codes, etc.)

19. **Manual Testing**
    - Test OAuth authorization flow in development
    - Test token refresh
    - Test revoking authorization
    - Test accessing offers with OAuth tokens

## Technical Details

### OAuth Flow Sequence

1. **User clicks "Authorize with Allegro"**
   - Frontend calls: `GET /api/allegro/oauth/authorize`
   - Backend generates:
     - `state` (random string, stored in DB)
     - `code_verifier` (random string, stored encrypted in DB)
     - `code_challenge` (SHA256 hash of verifier, base64url)
   - Backend returns: `{ authorizationUrl: string, state: string }`
   - Frontend redirects user to `authorizationUrl`

2. **User authorizes on Allegro**
   - User logs in to Allegro
   - User grants permissions
   - Allegro redirects to: `/auth/callback?code=...&state=...`

3. **Handle OAuth callback**
   - Frontend calls: `GET /api/allegro/oauth/callback?code=...&state=...`
   - Backend:
     - Validates `state` parameter
     - Retrieves `code_verifier` from DB
     - Exchanges code for tokens via Allegro API
     - Stores tokens (encrypted) in DB
     - Returns success

4. **Use OAuth tokens**
   - When accessing `/sale/offers`:
     - Backend retrieves user's OAuth access token
     - Checks if token is expired
     - If expired, refreshes using refresh token
     - Uses token in API requests

### PKCE Implementation

```typescript
// Generate code verifier (43-128 characters)
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Generate code challenge
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');
```

### Token Storage

- **Access Token**: Encrypted, stored in `allegroAccessToken`
- **Refresh Token**: Encrypted, stored in `allegroRefreshToken`
- **Expiration**: Stored in `allegroTokenExpiresAt`
- **Scopes**: Stored in `allegroTokenScopes` (comma-separated)

### Token Refresh Logic

```typescript
// Check if token is expired (with 5-minute buffer)
if (tokenExpiresAt && new Date() >= new Date(tokenExpiresAt.getTime() - 5 * 60 * 1000)) {
  // Token expires in less than 5 minutes, refresh it
  await refreshUserToken(userId);
}
```

## Security Considerations

1. **PKCE**: Always use PKCE for OAuth flow
2. **State Validation**: Always validate state parameter to prevent CSRF
3. **Token Encryption**: Encrypt all tokens before storing in database
4. **HTTPS**: Use HTTPS in production for OAuth redirects
5. **Token Expiration**: Check token expiration before use
6. **Error Handling**: Don't expose tokens in error messages or logs

## Migration Strategy

1. **Backward Compatibility**: Keep `client_credentials` support for public endpoints
2. **Gradual Migration**: Users can continue using client credentials until they authorize OAuth
3. **Clear Messaging**: Guide users to OAuth when they encounter 403 errors
4. **No Breaking Changes**: Existing functionality continues to work

## Files to Create/Modify

### New Files

- `services/allegro-service/src/allegro/allegro-oauth.service.ts`
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`
- `services/allegro-service/src/allegro/oauth/oauth.module.ts`
- `services/allegro-frontend-service/src/pages/AllegroOAuthCallbackPage.tsx`

### Modified Files

- `prisma/schema.prisma`
- `services/allegro-service/src/allegro/allegro-auth.service.ts`
- `services/allegro-service/src/allegro/allegro-api.service.ts`
- `services/allegro-service/src/allegro/offers/offers.service.ts`
- `services/allegro-service/src/allegro/offers/offers.controller.ts`
- `services/allegro-settings-service/src/settings/settings.service.ts`
- `services/allegro-settings-service/src/settings/settings.controller.ts`
- `services/allegro-settings-service/src/settings/dto/update-settings.dto.ts`
- `services/api-gateway/src/gateway/gateway.controller.ts`
- `services/allegro-frontend-service/src/pages/SettingsPage.tsx`
- `services/allegro-frontend-service/src/services/api.ts`
- `services/allegro-frontend-service/src/App.tsx`
- `.env.example`
- `README.md`
- `docs/LOCAL_DEV_SETUP.md`

## Estimated Effort

- **Phase 1** (Database): 1-2 hours
- **Phase 2** (OAuth Service): 4-6 hours
- **Phase 3** (OAuth Endpoints): 3-4 hours
- **Phase 4** (Frontend): 4-5 hours
- **Phase 5** (Environment): 1 hour
- **Phase 6** (Error Handling): 2-3 hours
- **Phase 7** (Testing): 4-6 hours

**Total**: ~19-27 hours

## Success Criteria

1. ✅ Users can authorize the application via Allegro OAuth
2. ✅ OAuth tokens are securely stored (encrypted)
3. ✅ Access tokens are automatically refreshed before expiration
4. ✅ Users can access `/sale/offers` endpoint with OAuth tokens
5. ✅ Users can revoke OAuth authorization
6. ✅ Clear error messages guide users to OAuth when needed
7. ✅ Backward compatibility maintained (client credentials still work for public endpoints)

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Database Schema Updates)
3. Implement phases sequentially
4. Test each phase before moving to the next
5. Update documentation as implementation progresses
