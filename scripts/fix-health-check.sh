#!/bin/bash
# Fix for health-check.sh container name matching bug
# This script applies a fix to the nginx-microservice health-check.sh script
# Usage: ./scripts/fix-health-check.sh

set -e

HEALTH_CHECK_SCRIPT="/home/statex/nginx-microservice/scripts/blue-green/health-check.sh"
BACKUP_SCRIPT="${HEALTH_CHECK_SCRIPT}.backup.$(date +%Y%m%d_%H%M%S)"

if [ ! -f "$HEALTH_CHECK_SCRIPT" ]; then
    echo "Error: Health check script not found at $HEALTH_CHECK_SCRIPT"
    echo "This script must be run on the production server where nginx-microservice is located"
    exit 1
fi

# Create backup
echo "Creating backup: $BACKUP_SCRIPT"
cp "$HEALTH_CHECK_SCRIPT" "$BACKUP_SCRIPT"

# Apply the fix
echo "Applying fix to health-check.sh..."

# Fix the container name matching pattern
sed -i 's/found_container=\$(docker ps --format "{{.Names}}" | grep -E "\${CONTAINER_BASE}" | head -1 || echo "")/found_container=$(docker ps --format "{{.Names}}" | grep -E "^${CONTAINER_BASE}(-${ACTIVE_COLOR})?$" | head -1 || echo "")/' "$HEALTH_CHECK_SCRIPT"

# Verify the fix was applied
if grep -q 'grep -E "\^${CONTAINER_BASE}(-\${ACTIVE_COLOR})?\$"' "$HEALTH_CHECK_SCRIPT"; then
    echo "✅ Fix applied successfully!"
    echo "Backup saved to: $BACKUP_SCRIPT"
    echo ""
    echo "To verify the fix, run:"
    echo "  cd /home/statex/nginx-microservice"
    echo "  ./scripts/blue-green/health-check.sh allegro-service"
else
    echo "❌ Fix may not have been applied correctly. Restoring backup..."
    cp "$BACKUP_SCRIPT" "$HEALTH_CHECK_SCRIPT"
    exit 1
fi

