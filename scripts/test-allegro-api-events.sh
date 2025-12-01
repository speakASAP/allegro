#!/bin/bash

# Test Allegro API Event Polling
# This script tests the event polling endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL="${FRONTEND_API_URL:-http://localhost:3411/api}"
ALLEGRO_SERVICE_URL="${ALLEGRO_SERVICE_URL:-http://localhost:3403}"
WEBHOOK_SERVICE_URL="${WEBHOOK_SERVICE_URL:-http://localhost:3405}"

echo -e "${GREEN}🚀 Testing Allegro Event Polling${NC}\n"
echo "API Base URL: $API_BASE_URL"
echo "Allegro Service URL: $ALLEGRO_SERVICE_URL"
echo "Webhook Service URL: $WEBHOOK_SERVICE_URL"
echo ""

# Test 1: Health checks
echo -e "${YELLOW}1. Testing Service Health Checks${NC}"
echo "----------------------------------------"

echo -n "Webhook Service: "
if curl -s -f "$WEBHOOK_SERVICE_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

echo -n "Allegro Service: "
if curl -s -f "$ALLEGRO_SERVICE_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Test 2: Event polling endpoint
echo -e "\n${YELLOW}2. Testing Event Polling Endpoint${NC}"
echo "----------------------------------------"
echo "POST $API_BASE_URL/webhooks/poll-events"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/webhooks/poll-events")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi

# Test 3: Direct offer events endpoint
echo -e "\n${YELLOW}3. Testing Direct Offer Events Endpoint${NC}"
echo "----------------------------------------"
echo "GET $ALLEGRO_SERVICE_URL/allegro/events/offers?limit=10"
RESPONSE=$(curl -s -w "\n%{http_code}" "$ALLEGRO_SERVICE_URL/allegro/events/offers?limit=10")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi

# Test 4: Direct order events endpoint
echo -e "\n${YELLOW}4. Testing Direct Order Events Endpoint${NC}"
echo "----------------------------------------"
echo "GET $ALLEGRO_SERVICE_URL/allegro/events/orders?limit=10"
RESPONSE=$(curl -s -w "\n%{http_code}" "$ALLEGRO_SERVICE_URL/allegro/events/orders?limit=10")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 404 ]; then
    if [ "$HTTP_CODE" -eq 404 ]; then
        echo -e "${YELLOW}⚠️  Status: $HTTP_CODE (Endpoint may not exist - this is OK)${NC}"
    else
        echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    fi
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi

# Test 5: Get processed events (may require auth)
echo -e "\n${YELLOW}5. Testing Get Processed Events${NC}"
echo "----------------------------------------"
echo "GET $API_BASE_URL/webhooks/events?limit=10"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/webhooks/events?limit=10")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" -eq 401 ]; then
    echo -e "${YELLOW}⚠️  Status: $HTTP_CODE (Authentication required - expected)${NC}"
else
    echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
    echo "Response: $BODY"
fi

echo -e "\n${GREEN}✅ Testing Complete${NC}"

