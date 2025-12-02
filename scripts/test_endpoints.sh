#!/bin/bash
# Test all endpoints through API Gateway to verify service URLs are working

echo "Testing endpoints through API Gateway..."
echo ""

# Get auth token (you'll need to login first and get token from browser localStorage)
# For now, we'll test endpoints that don't require auth or test with a token

echo "1. Testing health endpoints (no auth required):"
echo "   Product Service:"
docker exec allegro-api-gateway-green curl -s http://product-service:3402/health | jq '.' || echo "   ❌ Failed"
echo ""

echo "2. Testing API Gateway health:"
curl -s http://localhost:3411/health | jq '.' || echo "   ❌ Failed"
echo ""

echo "3. Check recent API Gateway logs (last 20 lines):"
docker logs allegro-api-gateway-green --tail 20
echo ""

echo "4. Check for any recent errors:"
docker logs allegro-api-gateway-green --since 5m | grep -i error | tail -10 || echo "   No recent errors"
echo ""

echo "✅ Endpoint testing complete"
echo ""
echo "Note: Enhanced logging will be active after rebuilding the API Gateway container:"
echo "  docker compose -f docker-compose.green.yml build api-gateway"
echo "  docker compose -f docker-compose.green.yml up -d api-gateway"

