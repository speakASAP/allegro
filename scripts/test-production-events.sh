#!/bin/bash

# Test Event Polling on Production
# This script tests the event polling endpoints on production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROD_API_URL="https://allegro.statex.cz/api"

echo -e "${BLUE}🚀 Testing Event Polling on Production${NC}\n"
echo "Production API URL: $PROD_API_URL"
echo ""

# Test 1: API Gateway Health
echo -e "${YELLOW}1. Testing API Gateway Health${NC}"
echo "----------------------------------------"
echo "GET $PROD_API_URL/health"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_API_URL/health" || echo "000")
if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    curl -s "$PROD_API_URL/health" | jq '.' 2>/dev/null || curl -s "$PROD_API_URL/health"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
fi
echo ""

# Test 2: Event Polling Endpoint
echo -e "${YELLOW}2. Testing Event Polling Endpoint${NC}"
echo "----------------------------------------"
echo "POST $PROD_API_URL/webhooks/poll-events"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PROD_API_URL/webhooks/poll-events" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" -eq 502 ] || [ "$HTTP_CODE" -eq 503 ]; then
    echo -e "${YELLOW}⚠️  Status: $HTTP_CODE (Service may be down or not deployed)${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 3: Get Processed Events (may require auth)
echo -e "${YELLOW}3. Testing Get Processed Events${NC}"
echo "----------------------------------------"
echo "GET $PROD_API_URL/webhooks/events?limit=5"
RESPONSE=$(curl -s -w "\n%{http_code}" "$PROD_API_URL/webhooks/events?limit=5" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" -eq 401 ]; then
    echo -e "${YELLOW}⚠️  Status: $HTTP_CODE (Authentication required - expected)${NC}"
elif [ "$HTTP_CODE" -eq 502 ] || [ "$HTTP_CODE" -eq 503 ]; then
    echo -e "${YELLOW}⚠️  Status: $HTTP_CODE (Service may be down or not deployed)${NC}"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 4: Check if services are accessible via internal network
echo -e "${YELLOW}4. Service Status Summary${NC}"
echo "----------------------------------------"
echo "Checking service endpoints..."

# Note: Direct service access may not be available from outside
echo -e "${BLUE}Note: Direct service endpoints are only accessible from within the Docker network${NC}"
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "If you see 502/503 errors:"
echo "  1. Services may not be deployed to production yet"
echo "  2. Services may be restarting"
echo "  3. Check Docker containers: docker compose ps"
echo "  4. Check service logs: docker compose logs webhook-service"
echo ""
echo "If you see 401 errors:"
echo "  - This is expected for protected endpoints"
echo "  - Use authentication token for full testing"
echo ""
echo -e "${GREEN}✅ Testing Complete${NC}"

