/**
 * Event Polling Test Script
 * Tests the event polling functionality
 * 
 * Install dependencies: npm install axios dotenv
 */

let axios: any;
let dotenv: any;
const { join } = require('path');

try {
  axios = require('axios');
  dotenv = require('dotenv');
} catch (error) {
  console.error('❌ Missing dependencies. Please install:');
  console.error('   npm install axios dotenv');
  process.exit(1);
}

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const API_BASE_URL = process.env.FRONTEND_API_URL || 'http://localhost:3411/api';
const ALLEGRO_SERVICE_URL = process.env.ALLEGRO_SERVICE_URL || 'http://localhost:3403';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<any>): Promise<void> {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    const data = await testFn();
    results.push({ name, passed: true, data });
    console.log(`✅ PASSED: ${name}`);
    if (data) {
      console.log(`   Data:`, JSON.stringify(data, null, 2).substring(0, 200));
    }
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Response:`, JSON.stringify(error.response.data, null, 2).substring(0, 200));
    }
  }
}

async function main() {
  console.log('🚀 Starting Event Polling Tests\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Allegro Service URL: ${ALLEGRO_SERVICE_URL}\n`);

  // Test 1: Check webhook service health
  await runTest('Webhook Service Health Check', async () => {
    const response = await axios.get(`${ALLEGRO_SERVICE_URL.replace('/allegro', '')}/health` || `http://localhost:3405/health`);
    return response.data;
  });

  // Test 2: Check Allegro service health
  await runTest('Allegro Service Health Check', async () => {
    const response = await axios.get(`${ALLEGRO_SERVICE_URL}/health` || `http://localhost:3403/health`);
    return response.data;
  });

  // Test 3: Test event polling endpoint (via API Gateway)
  await runTest('Event Polling Endpoint (POST /api/webhooks/poll-events)', async () => {
    const response = await axios.post(`${API_BASE_URL}/webhooks/poll-events`);
    return response.data;
  });

  // Test 4: Test direct event polling (via Allegro service)
  await runTest('Direct Offer Events Endpoint (GET /allegro/events/offers)', async () => {
    const response = await axios.get(`${ALLEGRO_SERVICE_URL}/allegro/events/offers`, {
      params: { limit: 10 },
    });
    return response.data;
  });

  // Test 5: Test order events endpoint
  await runTest('Direct Order Events Endpoint (GET /allegro/events/orders)', async () => {
    const response = await axios.get(`${ALLEGRO_SERVICE_URL}/allegro/events/orders`, {
      params: { limit: 10 },
    });
    return response.data;
  });

  // Test 6: Get processed events
  await runTest('Get Processed Events (GET /api/webhooks/events)', async () => {
    // Note: This requires authentication in production
    try {
      const response = await axios.get(`${API_BASE_URL}/webhooks/events`, {
        params: { limit: 10 },
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { message: 'Authentication required (expected)', status: 401 };
      }
      throw error;
    }
  });

  // Test 7: Test with 'after' parameter
  await runTest('Offer Events with after parameter', async () => {
    const response = await axios.get(`${ALLEGRO_SERVICE_URL}/allegro/events/offers`, {
      params: { after: 'test-event-id', limit: 5 },
    });
    return response.data;
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Detailed results
  console.log('\n📋 Detailed Results:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.name}`);
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.data) {
      console.log(`   Response:`, JSON.stringify(result.data, null, 2).substring(0, 300));
    }
  });
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

