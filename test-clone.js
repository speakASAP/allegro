// Test script to try creating an offer on Allegro
// Run inside allegro-green container: node /app/test-clone.js

const axios = require('axios');

// Minimal payload based on the offer rawData
const testPayload = {
  name: "TEST - Lenovo 2TB microSD karta",
  category: { id: "16242" },
  parameters: [
    { id: "11323", values: ["nové"], valuesIds: ["11323_1"] }
  ],
  images: ["https://a.allegroimg.com/original/11d7c9/eaf56b314544bde5ff911c81f41f"],
  description: {
    sections: [
      {
        items: [
          { type: "TEXT", content: "<p>Test product</p>" }
        ]
      }
    ]
  },
  sellingMode: {
    format: "BUY_NOW",
    price: { amount: "359.00", currency: "CZK" }
  },
  stock: { available: 1, unit: "UNIT" },
  location: { city: "Cetechovice", postCode: "76802", countryCode: "CZ" },
  delivery: {
    handlingTime: "PT96H",
    shippingRates: { id: "20d51d8a-56cb-4871-9a66-e61c1ec16165" }
  },
  payments: { invoice: "NO_INVOICE" },
  language: "cs-CZ"
};

async function testCreateOffer() {
  // Get token from allegro-service
  const accountId = 'e6498518-ed47-4f10-bd8e-200bad059ffd';

  try {
    // First get token via allegro-service internal endpoint
    console.log('Test payload keys:', Object.keys(testPayload));
    console.log('Test payload:', JSON.stringify(testPayload, null, 2));

    // Make direct call to Allegro API
    // You need to replace TOKEN with actual OAuth token
    const TOKEN = process.env.ALLEGRO_TOKEN;
    if (!TOKEN) {
      console.log('No ALLEGRO_TOKEN env var. Set it and run again.');
      return;
    }

    console.log('Making request to Allegro...');
    const response = await axios.post(
      'https://api.allegro.pl/sale/product-offers',
      testPayload,
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/vnd.allegro.public.v1+json',
          'Accept': 'application/vnd.allegro.public.v1+json',
        },
        timeout: 60000,
      }
    );
    console.log('SUCCESS! New offer ID:', response.data.id);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('ERROR:', error.response?.status, error.response?.statusText);
    console.log('Error data:', JSON.stringify(error.response?.data, null, 2));
  }
}

testCreateOffer();

