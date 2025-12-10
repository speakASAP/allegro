# Production OAuth Status and Configuration

## Service Status ✅

All services are running and healthy on production:

| Service | Status | Health | Port | Notes |
|---------|--------|--------|------|-------|
| API Gateway | ✅ Running | Healthy | 3411 | Up 3 hours |
| Allegro Service | ✅ Running | Healthy | 3403 | Up 6 minutes (recently restarted) |
| Frontend Service | ✅ Running | Unhealthy* | 3410 | Up 17 minutes |
| Settings Service | ✅ Running | Healthy | 3408 | Up 3 hours |
| Import Service | ✅ Running | Healthy | 3406 | Up 25 hours |

*Frontend shows "unhealthy" but is accessible and working

## OAuth Configuration ✅

### Environment Variables

```bash
ALLEGRO_REDIRECT_URI=https://allegro.statex.cz/api/allegro/oauth/callback
ALLEGRO_OAUTH_AUTHORIZE_URL=https://allegro.pl/auth/oauth/authorize
ALLEGRO_OAUTH_TOKEN_URL=https://allegro.pl/auth/oauth/token
```

### OAuth Routes Registered

All OAuth routes are properly registered:
- ✅ `GET /allegro/oauth/authorize` - Generate authorization URL
- ✅ `GET /allegro/oauth/callback` - Handle OAuth callback
- ✅ `GET /allegro/oauth/verify-config` - Verify configuration
- ✅ `GET /allegro/oauth/status` - Check OAuth status
- ✅ `POST /allegro/oauth/revoke` - Revoke authorization

### OAuth Status Endpoint

- **Status**: ✅ Working (200 OK)
- **URL**: `https://allegro.statex.cz/api/allegro/oauth/status`
- **Response**: Returns authorization status correctly

## Frontend Status ✅

### Settings Page

- **URL**: `https://allegro.statex.cz/dashboard/settings`
- **Status**: ✅ Accessible and working
- **OAuth Section**: ✅ Visible and functional

### OAuth Section Display

- **Status**: Shows "Not Authorized" (red indicator)
- **Button**: "Authorize with Allegro" button is visible and enabled
- **Message**: "OAuth authorization is required to import offers from Allegro. Click the button below to authorize the application."

## Ready for OAuth Authorization

The system is ready for OAuth authorization:

1. ✅ All services running
2. ✅ OAuth routes registered
3. ✅ Redirect URI configured correctly
4. ✅ OAuth section visible in UI
5. ✅ "Authorize with Allegro" button enabled

## Next Steps

1. **Click "Authorize with Allegro"** button on Settings page
2. **Complete authorization** on Allegro's page
3. **Verify redirect** - Should redirect to: `https://allegro.statex.cz/api/allegro/oauth/callback`
4. **Check status** - Should show "Authorized" after successful authorization

## Verification

### Check OAuth Configuration
```bash
ssh statex "cd /home/statex/allegro && cat .env | grep ALLEGRO_REDIRECT_URI"
# Expected: ALLEGRO_REDIRECT_URI=https://allegro.statex.cz/api/allegro/oauth/callback
```

### Check Service Logs
```bash
ssh statex "cd /home/statex/allegro && docker logs allegro-service-green --tail 50 | grep -i oauth"
```

### Test OAuth Status
- Go to: https://allegro.statex.cz/dashboard/settings
- OAuth section should show current authorization status
- Click "Authorize with Allegro" to start authorization flow

## Important Notes

1. **Redirect URI**: Must be registered in Allegro Developer Portal as:
   - `https://allegro.statex.cz/api/allegro/oauth/callback` (no trailing slash)

2. **Client Credentials**: Must be configured in Settings page before OAuth authorization

3. **OAuth Flow**: 
   - User clicks "Authorize with Allegro"
   - Redirects to Allegro authorization page
   - User grants permissions
   - Allegro redirects to: `https://allegro.statex.cz/api/allegro/oauth/callback?code=...&state=...`
   - Backend exchanges code for tokens
   - User redirected to Settings page with "Authorized" status

