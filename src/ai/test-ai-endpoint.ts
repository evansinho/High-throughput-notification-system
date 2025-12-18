/**
 * Test script for AI endpoint integration
 * Tests: API → JWT Auth → Rate Limiting → Input Validation → RAG → Response
 *
 * Usage: npx ts-node src/ai/test-ai-endpoint.ts
 */

import axios, { AxiosError } from 'axios';

const BASE_URL = 'http://localhost:3000';

// Test credentials (assumes a user exists in the system)
const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
};

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  details?: any;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Helper to record test result
 */
function recordTest(
  testName: string,
  passed: boolean,
  startTime: number,
  details?: any,
  error?: string,
) {
  results.push({
    testName,
    passed,
    duration: Date.now() - startTime,
    details,
    error,
  });

  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status}: ${testName}`);
  if (details) {
    console.log(`  Details:`, JSON.stringify(details, null, 2).substring(0, 200));
  }
  if (error) {
    console.log(`  Error: ${error}`);
  }
}

/**
 * Test 1: Authentication
 */
async function testAuth() {
  const startTime = Date.now();
  const testName = 'Authentication (JWT token acquisition)';

  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, TEST_USER);

    const token = response.data.access_token;

    if (token && typeof token === 'string') {
      recordTest(testName, true, startTime, { tokenLength: token.length });
      return token;
    } else {
      recordTest(testName, false, startTime, undefined, 'No token returned');
      return null;
    }
  } catch (error) {
    const err = error as AxiosError;
    recordTest(
      testName,
      false,
      startTime,
      undefined,
      err.response?.data ? JSON.stringify(err.response.data) : err.message,
    );
    return null;
  }
}

/**
 * Test 2: Endpoint without authentication (should fail)
 */
async function testNoAuth() {
  const startTime = Date.now();
  const testName = 'Endpoint without authentication (should return 401)';

  try {
    await axios.post(`${BASE_URL}/ai/generate-notification`, {
      query: 'Generate a test notification',
    });

    recordTest(testName, false, startTime, undefined, 'Should have returned 401');
  } catch (error) {
    const err = error as AxiosError;
    if (err.response?.status === 401) {
      recordTest(testName, true, startTime, { status: 401 });
    } else {
      recordTest(
        testName,
        false,
        startTime,
        undefined,
        `Expected 401, got ${err.response?.status}`,
      );
    }
  }
}

/**
 * Test 3: Input validation (query too short)
 */
async function testValidationShortQuery(token: string) {
  const startTime = Date.now();
  const testName = 'Input validation (query too short - should return 400)';

  try {
    await axios.post(
      `${BASE_URL}/ai/generate-notification`,
      {
        query: 'Short', // Less than 10 characters
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    recordTest(testName, false, startTime, undefined, 'Should have returned 400');
  } catch (error) {
    const err = error as AxiosError;
    if (err.response?.status === 400) {
      recordTest(testName, true, startTime, { status: 400 });
    } else {
      recordTest(
        testName,
        false,
        startTime,
        undefined,
        `Expected 400, got ${err.response?.status}`,
      );
    }
  }
}

/**
 * Test 4: Input validation (invalid channel)
 */
async function testValidationInvalidChannel(token: string) {
  const startTime = Date.now();
  const testName = 'Input validation (invalid channel - should return 400)';

  try {
    await axios.post(
      `${BASE_URL}/ai/generate-notification`,
      {
        query: 'Generate a notification for order shipment',
        channel: 'invalid_channel', // Not a valid enum value
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    recordTest(testName, false, startTime, undefined, 'Should have returned 400');
  } catch (error) {
    const err = error as AxiosError;
    if (err.response?.status === 400) {
      recordTest(testName, true, startTime, { status: 400 });
    } else {
      recordTest(
        testName,
        false,
        startTime,
        undefined,
        `Expected 400, got ${err.response?.status}`,
      );
    }
  }
}

/**
 * Test 5: Successful AI generation (with authentication)
 */
async function testSuccessfulGeneration(token: string) {
  const startTime = Date.now();
  const testName = 'Successful AI notification generation';

  try {
    const response = await axios.post(
      `${BASE_URL}/ai/generate-notification`,
      {
        query: 'Generate an email notification for order shipment with tracking number',
        channel: 'email',
        category: 'transactional',
        topK: 5,
        scoreThreshold: 0.7,
        temperature: 0.7,
        maxTokens: 1000,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (
      response.data.success &&
      response.data.data?.notification &&
      response.data.data.metadata
    ) {
      recordTest(testName, true, startTime, {
        requestId: response.data.requestId,
        generationTime: response.data.data.metadata.generationTimeMs,
        tokensUsed: response.data.data.metadata.tokensUsed,
        cost: response.data.data.metadata.cost,
        sources: response.data.data.metadata.retrievedCount,
      });
    } else {
      recordTest(testName, false, startTime, undefined, 'Invalid response structure');
    }
  } catch (error) {
    const err = error as AxiosError;
    recordTest(
      testName,
      false,
      startTime,
      undefined,
      err.response?.data ? JSON.stringify(err.response.data) : err.message,
    );
  }
}

/**
 * Test 6: Rate limiting (should fail after 10 requests)
 */
async function testRateLimiting(token: string) {
  const startTime = Date.now();
  const testName = 'Rate limiting (should block after 10 requests)';

  try {
    // Make 11 rapid requests
    const requests = [];
    for (let i = 0; i < 11; i++) {
      requests.push(
        axios.post(
          `${BASE_URL}/ai/generate-notification`,
          {
            query: `Generate a test notification for request ${i + 1}`,
            channel: 'email',
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: (status) => status < 500, // Don't throw on 429
          },
        ),
      );
    }

    const responses = await Promise.all(requests);

    // Count 429 responses
    const rateLimitedCount = responses.filter((r) => r.status === 429).length;

    if (rateLimitedCount > 0) {
      recordTest(testName, true, startTime, {
        totalRequests: 11,
        rateLimited: rateLimitedCount,
        succeeded: responses.filter((r) => r.status === 200).length,
      });
    } else {
      recordTest(
        testName,
        false,
        startTime,
        undefined,
        'No rate limiting detected (expected some 429s)',
      );
    }
  } catch (error) {
    const err = error as AxiosError;
    recordTest(testName, false, startTime, undefined, err.message);
  }
}

/**
 * Test 7: Cost tracking
 */
async function testCostTracking(token: string) {
  const startTime = Date.now();
  const testName = 'Cost tracking and metrics';

  try {
    const response = await axios.get(`${BASE_URL}/ai/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.data.overall && response.data.today) {
      recordTest(testName, true, startTime, {
        totalRequests: response.data.overall.totalRequests,
        totalCost: response.data.overall.totalCost,
        todayCost: response.data.today.cost,
      });
    } else {
      recordTest(testName, false, startTime, undefined, 'Invalid stats structure');
    }
  } catch (error) {
    const err = error as AxiosError;
    recordTest(testName, false, startTime, undefined, err.message);
  }
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('='.repeat(80));
  console.log('AI ENDPOINT INTEGRATION TEST SUITE');
  console.log('Testing: API → JWT Auth → Rate Limiting → Validation → RAG → Response');
  console.log('='.repeat(80));

  // Test 1: Get authentication token
  console.log('\n📝 Test 1: Authentication');
  const token = await testAuth();

  if (!token) {
    console.log('\n❌ Cannot proceed without authentication token');
    console.log('Please ensure:');
    console.log('  1. Server is running (npm run start:dev)');
    console.log('  2. User exists in database with credentials:');
    console.log(`     Email: ${TEST_USER.email}`);
    console.log(`     Password: ${TEST_USER.password}`);
    return;
  }

  // Test 2: Endpoint without auth
  console.log('\n📝 Test 2: Endpoint without authentication');
  await testNoAuth();

  // Test 3: Input validation (short query)
  console.log('\n📝 Test 3: Input validation (query too short)');
  await testValidationShortQuery(token);

  // Test 4: Input validation (invalid channel)
  console.log('\n📝 Test 4: Input validation (invalid channel)');
  await testValidationInvalidChannel(token);

  // Test 5: Successful generation
  console.log('\n📝 Test 5: Successful AI generation');
  await testSuccessfulGeneration(token);

  // Test 6: Rate limiting
  console.log('\n📝 Test 6: Rate limiting');
  await testRateLimiting(token);

  // Test 7: Cost tracking
  console.log('\n📝 Test 7: Cost tracking and metrics');
  await testCostTracking(token);

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const successRate = ((passed / total) * 100).toFixed(1);

  console.log(`\nTotal Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success Rate: ${successRate}%`);

  console.log('\nDetailed Results:');
  results.forEach((result, index) => {
    const status = result.passed ? '✅' : '❌';
    console.log(
      `  ${index + 1}. ${status} ${result.testName} (${result.duration}ms)`,
    );
    if (!result.passed && result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(80));

  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
