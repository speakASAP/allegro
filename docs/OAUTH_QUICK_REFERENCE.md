# OAuth Authorization - Quick Reference Guide

## Quick Troubleshooting Checklist

### If OAuth Authorization Fails

1. **Check Client ID and Secret**

   ```bash
   # Verify they are saved in database
   ssh statex "docker exec -i db-server-postgres psql -U dbadmin -d allegro -c 'SELECT \"userId\", \"allegroClientId\" IS NOT NULL as has_client_id, \"allegroClientSecret\" IS NOT NULL as has_client_secret FROM user_settings WHERE \"userId\" = '\''6'\'';'"
   ```

2. **Check Service Logs**

   ```bash
   # Allegro Service logs
   ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 100 | grep -E 'OAuth|error|Error'"
   
   # Settings Service logs
   ssh statex "cd /home/statex/allegro && docker logs allegro-settings-service-green --tail 100 | grep -E 'error|Error'"
   ```

3. **Verify OAuth State**

   ```bash
   # Check if state exists in database
   ssh statex "docker exec -i db-server-postgres psql -U dbadmin -d allegro -c 'SELECT \"userId\", \"allegroOAuthState\" IS NOT NULL as has_state FROM user_settings WHERE \"userId\" = '\''6'\'';'"
   ```

4. **Check Token Storage**

   ```bash
   # Verify tokens are stored correctly
   ssh statex "docker exec -i db-server-postgres psql -U dbadmin -d allegro -c 'SELECT \"userId\", \"allegroAccessToken\" IS NOT NULL as has_access_token, LENGTH(\"allegroAccessToken\") as token_length, \"allegroTokenExpiresAt\" FROM user_settings WHERE \"userId\" = '\''6'\'';'"
   ```

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_state` | State mismatch between storage and callback | Ensure state is trimmed consistently |
| `invalid_grant` | Authorization code expired or already used | Re-authorize (codes expire in ~10 minutes) |
| `Column too long` | Encrypted token exceeds database column size | Increase column size in schema (see Fix #5) |
| `Missing clientSecret` | Client Secret not sent from frontend | Check if secret is masked (`********`) and not sent |
| `Redirect URI mismatch` | Redirect URI doesn't match exactly | Normalize redirect URIs (trim, remove trailing slashes) |

## Database Column Sizes

| Column | Size | Notes |
|--------|------|-------|
| `allegroAccessToken` | VARCHAR(5000) | Encrypted, hex-encoded |
| `allegroRefreshToken` | VARCHAR(5000) | Encrypted, hex-encoded |
| `allegroTokenScopes` | VARCHAR(1000) | Comma-separated scopes |
| `allegroOAuthState` | VARCHAR(255) | OAuth state for verification |
| `allegroOAuthCodeVerifier` | VARCHAR(500) | Encrypted PKCE code verifier |

## Environment Variables

### Required for OAuth

```bash
# Allegro API Configuration
ALLEGRO_CLIENT_ID=your_client_id
ALLEGRO_CLIENT_SECRET=your_client_secret

# OAuth Configuration
ALLEGRO_REDIRECT_URI=https://allegro.statex.cz/api/allegro/oauth/callback  # Production
# ALLEGRO_REDIRECT_URI=http://localhost:3411/api/allegro/oauth/callback   # Local Dev

ALLEGRO_OAUTH_AUTHORIZE_URL=https://allegro.pl/auth/oauth/authorize
ALLEGRO_OAUTH_TOKEN_URL=https://allegro.pl/auth/oauth/token

# Encryption (for storing tokens)
ENCRYPTION_KEY=your_32_character_encryption_key
```

## OAuth Flow Steps

1. **User clicks "Authorize with Allegro"**
   - Frontend calls `GET /api/allegro/oauth/authorize`
   - Backend generates PKCE (state, code verifier)
   - Backend stores state and encrypted code verifier in database
   - Backend returns authorization URL

2. **User authorizes on Allegro**
   - User is redirected to Allegro authorization page
   - User grants permissions
   - Allegro redirects back with `code` and `state`

3. **Callback processing**
   - Backend receives callback at `/api/allegro/oauth/callback`
   - Backend validates state (must match stored state)
   - Backend retrieves code verifier from database
   - Backend exchanges code for tokens

4. **Token storage**
   - Backend encrypts access token and refresh token
   - Backend saves encrypted tokens to database
   - Backend clears OAuth state and code verifier
   - Backend redirects to frontend success page

## Useful Commands

### Clear OAuth State (if stuck)

```bash
# Using script
cd /Users/sergiystashok/Documents/GitHub/statex.cz/allegro
npx ts-node scripts/clear-oauth-state.ts

# Or manually via database
ssh statex "docker exec -i db-server-postgres psql -U dbadmin -d allegro -c \"UPDATE user_settings SET \\\"allegroOAuthState\\\" = NULL, \\\"allegroOAuthCodeVerifier\\\" = NULL WHERE \\\"userId\\\" = '6';\""
```

### Check OAuth Status

```bash
# Via API (requires authentication)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://allegro.statex.cz/api/allegro/oauth/status

# Via database
ssh statex "docker exec -i db-server-postgres psql -U dbadmin -d allegro -c 'SELECT \"userId\", \"allegroAccessToken\" IS NOT NULL as authorized, \"allegroTokenExpiresAt\" FROM user_settings WHERE \"userId\" = '\''6'\'';'"
```

### Rebuild Service After Code Changes

```bash
# On production server
ssh statex "cd /home/statex/allegro && git pull && docker compose -f docker-compose.green.yml build allegro-service && docker compose -f docker-compose.green.yml up -d allegro-service"
```

## Testing Checklist

- [ ] Client ID and Secret are saved in Settings
- [ ] "Authorize with Allegro" button is visible and enabled
- [ ] Clicking button redirects to Allegro authorization page
- [ ] After authorization, callback processes successfully
- [ ] Tokens are stored in database (check with SQL query)
- [ ] Settings page shows "Authorized" status
- [ ] Token expiration date is displayed
- [ ] Scopes are displayed
- [ ] "Revoke Authorization" button works
- [ ] After revoke, tokens are cleared from database

## Related Documentation

- [Complete Troubleshooting Guide](./OAUTH_TROUBLESHOOTING_COMPLETE.md) - Full documentation of all issues and fixes
- [OAuth Implementation Plan](./OAUTH_IMPLEMENTATION_PLAN.md) - Initial implementation plan
- [OAuth 400 Error Troubleshooting](./OAUTH_400_ERROR_TROUBLESHOOTING.md) - Specific guide for 400 errors
