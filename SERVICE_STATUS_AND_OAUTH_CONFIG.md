# Service Status and OAuth Configuration Check

## Service Status

### ✅ Running Services

1. **API Gateway** (Port 3411)
   - Status: ✅ Running
   - Health Check: ✅ Responding
   - Response: `{"status":"ok","service":"api-gateway"}`

2. **Frontend Service** (Port 3410)
   - Status: ✅ Running
   - Process: Vite dev server
   - Accessible at: http://localhost:3410

3. **Settings Service** (Port 3408)
   - Status: ✅ Running
   - Process: ts-node

4. **Concurrently Process**
   - Status: ✅ Running
   - Managing: API-GW, ALLEGRO, IMPORT, SETTINGS, FRONTEND

### ❌ Issues Found

1. **Allegro Service** (Port 3403)
   - Status: ⚠️ **NOT RESPONDING**
   - Health Check: ❌ Failed (connection refused)
   - **This is why OAuth status returns 503**

2. **OAuth Status Endpoint**
   - URL: `http://localhost:3411/api/allegro/oauth/status`
   - Status: ❌ 503 Service Unavailable
   - Reason: Allegro service not responding

## OAuth Configuration

### Required Environment Variables

Based on the code, the following OAuth variables are required:

1. **`ALLEGRO_REDIRECT_URI`**
   - **For Local Dev**: Should be `http://localhost:3411/api/allegro/oauth/callback`
   - **For Production**: `https://allegro.statex.cz/api/allegro/oauth/callback`
   - **Note**: The callback goes through the API Gateway, so it should use port 3411 (API Gateway port)

2. **`ALLEGRO_OAUTH_AUTHORIZE_URL`**
   - Default: `https://allegro.pl/auth/oauth/authorize`
   - Required: Yes

3. **`ALLEGRO_OAUTH_TOKEN_URL`**
   - Default: `https://allegro.pl/auth/oauth/token`
   - Required: Yes

4. **`ALLEGRO_CLIENT_ID`**
   - Current: `c59bf103cfc742f79446d7ebe3a8c5c8`
   - Status: ✅ Configured

5. **`ALLEGRO_CLIENT_SECRET`**
   - Status: ⚠️ **Decryption Error** - Needs to be re-entered

### OAuth Flow

1. **Authorization Request**: `GET /api/allegro/oauth/authorize`
   - Goes through API Gateway (port 3411)
   - Routes to Allegro Service (port 3403)
   - Generates authorization URL with redirect_uri

2. **Callback**: `GET /api/allegro/oauth/callback`
   - Allegro redirects to: `http://localhost:3411/api/allegro/oauth/callback?code=...&state=...`
   - Goes through API Gateway
   - Routes to Allegro Service
   - Exchanges code for tokens

3. **Status Check**: `GET /api/allegro/oauth/status`
   - Currently failing with 503 because Allegro Service is not responding

## Issues to Fix

### 1. Allegro Service Not Running ⚠️

**Problem**: Allegro service on port 3403 is not responding to health checks.

**Check**:
```bash
# Check if process is running
ps aux | grep -E 'allegro-service|nest.*allegro' | grep -v grep

# Check if port is listening
lsof -i :3403

# Check service logs
cd services/allegro-service && npm run start:dev
```

**Solution**: 
- Check if the service crashed
- Check for errors in the console where `npm run start:dev` is running
- Restart the service if needed

### 2. Client Secret Decryption Error ⚠️

**Problem**: Client Secret exists in database but cannot be decrypted.

**Solution**:
1. Go to Settings page: http://localhost:3410/dashboard/settings
2. Re-enter the Client Secret in the "Client Secret" field
3. Click "Save"
4. This will re-encrypt and store it with the current encryption key

### 3. OAuth Redirect URI Configuration ⚠️

**Current Issue**: Documentation says `http://localhost:3410/auth/callback` but should be `http://localhost:3411/api/allegro/oauth/callback`

**Correct Configuration**:
- **Local Dev**: `ALLEGRO_REDIRECT_URI=http://localhost:3411/api/allegro/oauth/callback`
- **Production**: `ALLEGRO_REDIRECT_URI=https://allegro.statex.cz/api/allegro/oauth/callback`

**Why**: The callback endpoint is at `/api/allegro/oauth/callback` which goes through the API Gateway (port 3411), not the frontend (port 3410).

## Next Steps

1. **Fix Allegro Service**:
   - Check why it's not responding
   - Restart if needed
   - Verify it starts on port 3403

2. **Fix Client Secret**:
   - Re-enter in Settings page
   - Save to re-encrypt

3. **Verify OAuth Configuration**:
   - Check `.env` file has correct `ALLEGRO_REDIRECT_URI`
   - Should be: `http://localhost:3411/api/allegro/oauth/callback` for local dev
   - Register same URI in Allegro Developer Portal

4. **Test OAuth Flow**:
   - Once services are running, try "Authorize with Allegro" button
   - Should redirect to Allegro authorization page
   - After authorization, should redirect back and show "Authorized" status

