#!/bin/bash
# Restart API Gateway to pick up new code changes

cd ~/allegro || exit 1

echo "Stopping and removing API Gateway container..."
docker compose -f docker-compose.green.yml stop api-gateway
docker compose -f docker-compose.green.yml rm -f api-gateway

echo ""
echo "Starting API Gateway with new code..."
docker compose -f docker-compose.green.yml up -d api-gateway

echo ""
echo "Waiting for API Gateway to start..."
sleep 8

echo ""
echo "Checking API Gateway logs for startup..."
docker logs allegro-api-gateway-green --tail 20

echo ""
echo "Testing endpoint (should return 401, not 500):"
curl -s http://localhost:3411/api/sync/jobs | jq '.'

echo ""
echo "✅ API Gateway restarted"

