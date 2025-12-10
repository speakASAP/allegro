# OAuth 400 Error - Fixes Summary

## Overview

This document summarizes all the fixes applied to resolve the OAuth 400 error during token exchange with Allegro API.

## Problem

When clicking "Authorize with Allegro", the OAuth flow would start successfully but fail with a 400 error during the token exchange step:

```
Failed to exchange authorization code: Request failed with status code 400
```

## Root Causes Identified

1. **Redirect URI Mismatch** - The redirect URI used in authorization URL generation might not match exactly with the one used in token exchange
2. **Parameter Validation** - Missing validation for required parameters
3. **Whitespace Issues** - Code and state parameters might contain whitespace from URL encoding
4. **Insufficient Logging** - Limited error information made debugging difficult

## Fixes Applied

### 1. Redirect URI Normalization ✅

**Files Modified:**
- `services/allegro-service/src/allegro/allegro-oauth.service.ts`
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`

**Changes:**
- Added automatic normalization to remove trailing slashes and trim whitespace
- Applied consistently in both `generateAuthorizationUrl()` and `exchangeCodeForToken()`
- Ensures exact matching between authorization URL and token exchange

**Code:**
```typescript
const normalizedRedirectUri = redirectUri.trim().replace(/\/+$/, '');
```

### 2. Parameter Validation ✅

**Files Modified:**
- `services/allegro-service/src/allegro/allegro-oauth.service.ts`
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`

**Changes:**
- Added validation to ensure all required parameters are present
- Validates: `code`, `codeVerifier`, `redirectUri`, `clientId`, `clientSecret`
- Throws descriptive errors if any parameter is missing

**Code:**
```typescript
if (!code || !codeVerifier || !redirectUri || !clientId || !clientSecret) {
  throw new Error('Missing required parameters for token exchange');
}
```

### 3. Code and State Trimming ✅

**Files Modified:**
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`

**Changes:**
- Automatically trims whitespace from `code` and `state` query parameters
- Validates trimmed values are not empty
- Prevents issues with URL-encoded whitespace

**Code:**
```typescript
const trimmedCode = code.trim();
const trimmedState = state.trim();

if (!trimmedCode || !trimmedState) {
  return res.redirect(`${this.getFrontendUrl()}/auth/callback?error=invalid_parameters`);
}
```

### 4. Enhanced Error Logging ✅

**Files Modified:**
- `services/allegro-service/src/allegro/allegro-oauth.service.ts`
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`

**Changes:**
- Logs both original and normalized redirect URIs
- Shows request body preview (without sensitive data)
- Captures detailed error information from Allegro API
- Logs parameter lengths and validation status
- Includes `errorCode` and `errorDescription` from Allegro's response

**Example Log Output:**
```json
{
  "error": "error message",
  "status": 400,
  "errorCode": "invalid_grant",
  "errorDescription": "The provided authorization code is invalid",
  "redirectUri": "https://allegro.statex.cz/api/allegro/oauth/callback",
  "originalRedirectUri": "https://allegro.statex.cz/api/allegro/oauth/callback/",
  "codeLength": 128,
  "codeVerifierLength": 128
}
```

### 5. Configuration Verification Endpoint ✅

**Files Modified:**
- `services/allegro-service/src/allegro/oauth/oauth.controller.ts`

**Changes:**
- Added `GET /allegro/oauth/verify-config` endpoint
- Returns configuration status without exposing sensitive data
- Helps verify OAuth setup before attempting authorization

**Response:**
```json
{
  "success": true,
  "data": {
    "hasClientId": true,
    "clientIdPreview": "c59bf103...",
    "hasClientSecret": true,
    "hasOAuthState": false,
    "hasCodeVerifier": false,
    "redirectUri": "https://allegro.statex.cz/api/allegro/oauth/callback",
    "redirectUriConfigured": true,
    "redirectUriNormalized": false
  }
}
```

## Testing Checklist

### Pre-Authorization Checks

1. **Verify Configuration:**
   ```bash
   # Check redirect URI in .env
   ssh statex "cd /home/statex/allegro && cat .env | grep ALLEGRO_REDIRECT_URI"
   
   # Expected: ALLEGRO_REDIRECT_URI=https://allegro.statex.cz/api/allegro/oauth/callback
   ```

2. **Check OAuth Config Endpoint:**
   - Go to Settings page
   - Open browser console
   - Call: `GET /api/allegro/oauth/verify-config`
   - Verify all fields are `true` (except `hasOAuthState` and `hasCodeVerifier` before authorization)

3. **Verify Allegro Developer Portal:**
   - Go to https://developer.allegro.pl/
   - Check your application's redirect URIs
   - Ensure `https://allegro.statex.cz/api/allegro/oauth/callback` is listed (no trailing slash)

### During Authorization

1. **Click "Authorize with Allegro"**
   - Should redirect to Allegro authorization page
   - Check browser network tab for authorization URL
   - Verify `redirect_uri` parameter matches exactly

2. **Complete Authorization**
   - Grant permissions on Allegro
   - Should redirect back to callback URL

3. **Monitor Logs:**
   ```bash
   ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 100 -f"
   ```

### Post-Authorization

1. **Check OAuth Status:**
   - Go to Settings page
   - OAuth section should show "✓ Authorized with Allegro"
   - Should display expiration date and scopes

2. **Test Import:**
   - Go to Import page
   - Click "Import from Allegro API"
   - Should work without 500/403 errors

## Verification Commands

### Check Recent OAuth Logs
```bash
ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 200 | grep -A 15 'OAuth\|authorization\|token exchange'"
```

### Check for Errors
```bash
ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 500 | grep -i 'error\|failed\|400' | tail -20"
```

### Verify Service Status
```bash
ssh statex "cd /home/statex/allegro && docker compose -f docker-compose.green.yml ps allegro-service"
```

## Expected Behavior After Fixes

1. **Authorization URL Generation:**
   - Redirect URI is normalized (no trailing slashes)
   - Logs show both original and normalized URIs

2. **Token Exchange:**
   - All parameters are validated before API call
   - Redirect URI matches exactly what was used in authorization
   - Detailed error logging if exchange fails

3. **Error Handling:**
   - Clear error messages with specific Allegro error codes
   - Logs include all relevant debugging information
   - User-friendly error messages in frontend

## Common Issues and Solutions

### Issue: Still Getting 400 Error

**Solution:**
1. Check logs for exact error code and description
2. Verify redirect URI in Allegro Developer Portal matches exactly
3. Ensure no trailing slashes or extra whitespace
4. Try clearing OAuth state and re-authorizing

### Issue: Redirect URI Mismatch

**Solution:**
1. Check `.env` file for `ALLEGRO_REDIRECT_URI`
2. Verify in Allegro Developer Portal
3. Ensure normalization is working (check logs)
4. Update Allegro Developer Portal if needed

### Issue: Code Verifier Decryption Fails

**Solution:**
1. Clear OAuth state: Use `scripts/clear-oauth-state.ts`
2. Try authorization again
3. Check encryption key is correct

## Files Changed

1. `services/allegro-service/src/allegro/allegro-oauth.service.ts`
   - Added redirect URI normalization
   - Added parameter validation
   - Enhanced error logging

2. `services/allegro-service/src/allegro/oauth/oauth.controller.ts`
   - Added redirect URI normalization
   - Added code/state trimming
   - Added configuration verification endpoint
   - Enhanced logging throughout

3. `docs/OAUTH_400_ERROR_TROUBLESHOOTING.md`
   - Comprehensive troubleshooting guide

4. `docs/OAUTH_FIXES_SUMMARY.md` (this file)
   - Summary of all fixes

## Next Steps

1. **Test the OAuth flow** with the fixes applied
2. **Monitor logs** during authorization attempts
3. **Verify redirect URI** in Allegro Developer Portal matches exactly
4. **If issues persist**, check logs for specific error codes from Allegro API

## Related Documentation

- [OAuth 400 Error Troubleshooting Guide](./OAUTH_400_ERROR_TROUBLESHOOTING.md)
- [OAuth Implementation Plan](./OAUTH_IMPLEMENTATION_PLAN.md)
- [Local Dev Setup](./LOCAL_DEV_SETUP.md)

