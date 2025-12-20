#!/bin/bash
# Test clone script - to be run on the server

# Get encryption key from env
ENCRYPTION_KEY=$(docker exec allegro-green printenv ENCRYPTION_KEY)

# Query DB to get the encrypted token
TOKEN_ENC=$(docker exec db-server-postgres psql -U dbadmin -d allegro -t -c "SELECT \"accessToken\" FROM allegro_accounts WHERE id = 'e6498518-ed47-4f10-bd8e-200bad059ffd';")

echo "Encrypted token (first 50 chars): ${TOKEN_ENC:0:50}..."

# We need to decrypt using the same algorithm as the service
# The service uses AES-256-CBC with the ENCRYPTION_KEY
# Let's use the allegro-service to do this via a direct HTTP call instead

# Create a minimal test payload
cat > /tmp/test-payload.json << 'EOF'
{
  "name": "TEST DELETE - Lenovo 2TB microSD",
  "category": { "id": "16242" },
  "parameters": [
    { "id": "11323", "values": ["nové"], "valuesIds": ["11323_1"] }
  ],
  "images": ["https://a.allegroimg.com/original/11d7c9/eaf56b314544bde5ff911c81f41f"],
  "description": {
    "sections": [
      {
        "items": [
          { "type": "TEXT", "content": "<p>Test product - DELETE THIS</p>" }
        ]
      }
    ]
  },
  "sellingMode": {
    "format": "BUY_NOW",
    "price": { "amount": "359.00", "currency": "CZK" }
  },
  "stock": { "available": 1, "unit": "UNIT" },
  "location": { "city": "Cetechovice", "postCode": "76802", "countryCode": "CZ" },
  "delivery": {
    "handlingTime": "PT96H",
    "shippingRates": { "id": "20d51d8a-56cb-4871-9a66-e61c1ec16165" }
  },
  "payments": { "invoice": "NO_INVOICE" },
  "language": "cs-CZ"
}
EOF

echo "Test payload created"
cat /tmp/test-payload.json

