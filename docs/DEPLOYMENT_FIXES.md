# Deployment Fixes

This document tracks fixes and workarounds needed for the blue/green deployment system.

## Health Check Script Container Name Matching Fix

### Issue
The health-check script in the nginx-microservice deployment infrastructure has a bug where it incorrectly matches container names when a container is not found.

**Problem**: When looking for `allegro-service-green`, the script incorrectly matches `allegro-service-settings-green` because the grep pattern `grep -E "${CONTAINER_BASE}"` is too broad and matches any container containing the base name as a substring.

### Fix Location
The fix must be applied to: `/home/statex/nginx-microservice/scripts/blue-green/health-check.sh`

### Required Change
In the `health-check.sh` script, around line 167, change:

```bash
found_container=$(docker ps --format "{{.Names}}" | grep -E "${CONTAINER_BASE}" | head -1 || echo "")
```

To:

```bash
found_container=$(docker ps --format "{{.Names}}" | grep -E "^${CONTAINER_BASE}(-${ACTIVE_COLOR})?$" | head -1 || echo "")
```

### Explanation
The new pattern `^${CONTAINER_BASE}(-${ACTIVE_COLOR})?$` ensures:
- The container name starts with the exact `CONTAINER_BASE` (using `^`)
- Optionally followed by a hyphen and the active color (e.g., `-green` or `-blue`)
- The container name ends there (using `$`)

This prevents false matches like `allegro-service-settings-green` when looking for `allegro-service-green`.

### Verification
After applying the fix, verify it works:
```bash
cd /home/statex/nginx-microservice
./scripts/blue-green/health-check.sh allegro-service
```

All services should be correctly identified and health checks should pass.

### Application
To apply this fix, you can use the provided script:

```bash
# From the allegro-service repository
./scripts/fix-health-check.sh
```

Or manually apply the change to `/home/statex/nginx-microservice/scripts/blue-green/health-check.sh` as described above.

### Status
- ✅ Fix identified and tested
- ✅ Fix script created in allegro-service repository (`scripts/fix-health-check.sh`)
- ⚠️ Fix needs to be applied to nginx-microservice repository (on production server)
- 📝 This fix should be committed to the nginx-microservice GitHub repository for permanent solution

