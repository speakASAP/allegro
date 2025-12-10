# OAuth 400 Error Troubleshooting Guide

## Problem

When clicking "Authorize with Allegro", the OAuth flow starts but fails with a 400 error during token exchange:

```text
Failed to exchange authorization code: Request failed with status code 400
```

## Common Causes

### 1. Redirect URI Mismatch (Most Common)

The redirect URI used in the authorization request **must match exactly** what's registered in Allegro's Developer Portal.

**Current Configuration:**

- Production: `https://allegro.statex.cz/api/allegro/oauth/callback`
- Development: `http://localhost:3410/auth/callback` (Note: This is incorrect - should be backend URL)

**Verification Steps:**

1. Check `.env` file: `ALLEGRO_REDIRECT_URI=https://allegro.statex.cz/api/allegro/oauth/callback`
2. Go to [Allegro Developer Portal](https://developer.allegro.pl/)
3. Check your application's registered redirect URIs
4. Ensure they match **exactly** (including protocol, domain, path, no trailing slashes)

**Fix:**

- If redirect URI doesn't match, add the correct one in Allegro Developer Portal
- Or update `.env` to match what's registered in Allegro

### 2. Invalid Client Credentials

The Client ID and Client Secret must be correct and match the application in Allegro Developer Portal.

**Verification:**

- Check Settings page - ensure Client ID and Client Secret are saved
- Verify credentials in Allegro Developer Portal match what's configured

### 3. PKCE Code Verifier Mismatch

The code verifier used in token exchange must match the code challenge sent in authorization.

**This is handled automatically by the code**, but can fail if:

- State is cleared between authorization and callback
- Encryption/decryption fails

**Check logs for:**

- "Failed to decrypt code verifier"
- "State validation failed"

### 4. Authorization Code Already Used or Expired

Authorization codes are single-use and expire quickly (usually within 10 minutes).

**If you see this error:**

- Try the authorization flow again from the beginning
- Don't refresh or navigate away during the flow

## Debugging Steps

### 1. Check Detailed Error Logs

With the improved logging, check production logs:

```bash
ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 100 | grep -A 10 'Failed to exchange'"
```

Look for:

- `errorCode` - The specific Allegro error code
- `errorDescription` - Detailed error message from Allegro
- `redirectUri` - The redirect URI being used
- `errorData` - Full error response from Allegro API

### 2. Verify Redirect URI Configuration

```bash
ssh statex "cd /home/statex/allegro && cat .env | grep ALLEGRO_REDIRECT_URI"
```

### 3. Test Authorization URL Generation

The authorization URL should include the correct redirect URI. Check logs when clicking "Authorize with Allegro":

```bash
ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 50 | grep 'Generated OAuth authorization URL'"
```

### 4. Check Allegro Developer Portal

1. Go to <https://developer.allegro.pl/>
2. Navigate to your application
3. Check "Redirect URIs" section
4. Ensure `https://allegro.statex.cz/api/allegro/oauth/callback` is listed
5. If not, add it and save

## Expected Flow

1. User clicks "Authorize with Allegro"
2. Backend generates authorization URL with:
   - `redirect_uri=https://allegro.statex.cz/api/allegro/oauth/callback`
   - `code_challenge` (PKCE)
   - `state` (CSRF protection)
3. User is redirected to Allegro
4. User authorizes the application
5. Allegro redirects to: `https://allegro.statex.cz/api/allegro/oauth/callback?code=...&state=...`
6. Backend receives callback, validates state
7. Backend exchanges code for tokens using:
   - Same `redirect_uri` as in step 2
   - `code_verifier` (decrypted from database)
   - Client credentials
8. Backend stores tokens and redirects to frontend success page

## Most Likely Issue

Based on the error, the most likely cause is **redirect URI mismatch**.

The redirect URI in the token exchange request must match:

1. What was used in the authorization URL
2. What's registered in Allegro Developer Portal

**Action Required:**

1. Verify redirect URI in Allegro Developer Portal matches `https://allegro.statex.cz/api/allegro/oauth/callback`
2. If it doesn't match, either:
   - Add the correct URI in Allegro Developer Portal, OR
   - Update `.env` to match what's registered

## Recent Fixes Applied

### 1. Redirect URI Normalization

- Added automatic normalization to remove trailing slashes and trim whitespace
- Ensures exact matching between authorization URL and token exchange
- Applied consistently in both `generateAuthorizationUrl` and `exchangeCodeForToken`

### 2. Parameter Validation

- Added validation to ensure all required parameters (code, codeVerifier, redirectUri, clientId, clientSecret) are present
- Trims whitespace from code and state parameters to handle URL encoding issues
- Validates parameters before making API calls

### 3. Enhanced Logging

- Logs both original and normalized redirect URIs
- Shows request body preview (without sensitive data)
- Captures detailed error information from Allegro API
- Logs parameter lengths and validation status

### 4. Code and State Trimming

- Automatically trims code and state parameters from query string
- Prevents issues with URL-encoded whitespace
- Validates trimmed values are not empty

## Next Steps

After applying these fixes:

1. **Try the OAuth flow again** - The normalization and validation should resolve most redirect URI mismatch issues
2. **Check logs for detailed error information** - Enhanced logging will show exactly what's being sent to Allegro
3. **Verify redirect URI in Allegro Developer Portal** - Ensure it matches exactly: `https://allegro.statex.cz/api/allegro/oauth/callback` (no trailing slash)
4. **If still failing**, review the `errorCode` and `errorDescription` from Allegro API response in the logs
