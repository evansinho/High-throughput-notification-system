/**
 * k6 Load Test Script for Notification System
 *
 * Performance Targets:
 * - Throughput: 50,000 requests/second
 * - P95 Latency: < 100ms
 * - P99 Latency: < 500ms
 * - Error Rate: < 1%
 *
 * Test Scenarios:
 * 1. Smoke Test: 1 VU for 30s (sanity check)
 * 2. Load Test: Ramp up to target load
 * 3. Stress Test: Push beyond limits
 * 4. Spike Test: Sudden traffic surge
 * 5. Soak Test: Sustained load over time
 *
 * Usage:
 *   k6 run --scenario smoke load-tests/notification-load-test.js
 *   k6 run --scenario load load-tests/notification-load-test.js
 *   k6 run --scenario stress load-tests/notification-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const notificationCreatedRate = new Rate('notification_created');
const notificationLatency = new Trend('notification_latency');
const notificationErrors = new Counter('notification_errors');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token-123';

// Test data generators
const CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'IN_APP'];
const TYPES = ['TRANSACTIONAL', 'MARKETING', 'SYSTEM'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function generateNotificationPayload() {
  const channel = randomItem(CHANNELS);
  const type = randomItem(TYPES);
  const priority = randomItem(PRIORITIES);

  let payload = {};

  // Generate channel-specific payload
  switch (channel) {
    case 'EMAIL':
      payload = {
        to: `user${randomIntBetween(1, 10000)}@example.com`,
        subject: `Test Notification ${randomString(10)}`,
        body: `This is a test notification with random content: ${randomString(50)}`,
        from: 'noreply@example.com',
      };
      break;
    case 'SMS':
      payload = {
        to: `+1${randomIntBetween(2000000000, 9999999999)}`,
        message: `Test SMS: ${randomString(30)}`,
      };
      break;
    case 'PUSH':
      payload = {
        deviceToken: `device_${randomString(20)}`,
        title: `Push Notification ${randomString(10)}`,
        body: `Push content: ${randomString(40)}`,
        data: {
          action: 'view',
          item_id: randomIntBetween(1, 1000),
        },
      };
      break;
    case 'IN_APP':
      payload = {
        title: `In-App Notification ${randomString(10)}`,
        message: `In-app content: ${randomString(50)}`,
        action_url: `/items/${randomIntBetween(1, 1000)}`,
      };
      break;
  }

  return {
    userId: `user-${randomIntBetween(1, 10000)}`,
    tenantId: `tenant-${randomIntBetween(1, 100)}`,
    channel,
    type,
    priority,
    payload,
    idempotencyKey: `key-${Date.now()}-${randomString(10)}`,
  };
}

// Scenarios configuration
export const options = {
  scenarios: {
    // Scenario 1: Smoke Test - Basic sanity check
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
      exec: 'smokeTest',
    },

    // Scenario 2: Load Test - Ramp up to target load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // Ramp up to 100 VUs
        { duration: '5m', target: 100 },   // Stay at 100 VUs
        { duration: '2m', target: 500 },   // Ramp up to 500 VUs
        { duration: '5m', target: 500 },   // Stay at 500 VUs
        { duration: '2m', target: 1000 },  // Ramp up to 1000 VUs
        { duration: '5m', target: 1000 },  // Stay at 1000 VUs
        { duration: '2m', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'load' },
      exec: 'loadTest',
    },

    // Scenario 3: Stress Test - Push beyond limits
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 1000 },   // Ramp up to 1K VUs
        { duration: '3m', target: 1000 },   // Stay at 1K
        { duration: '2m', target: 5000 },   // Ramp to 5K VUs
        { duration: '3m', target: 5000 },   // Stay at 5K
        { duration: '2m', target: 10000 },  // Ramp to 10K VUs
        { duration: '3m', target: 10000 },  // Stay at 10K
        { duration: '3m', target: 0 },      // Ramp down
      ],
      gracefulRampDown: '1m',
      tags: { test_type: 'stress' },
      exec: 'stressTest',
    },

    // Scenario 4: Spike Test - Sudden traffic surge
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },   // Normal load
        { duration: '1m', target: 100 },    // Stay normal
        { duration: '10s', target: 5000 },  // Sudden spike!
        { duration: '3m', target: 5000 },   // Stay high
        { duration: '10s', target: 100 },   // Drop back
        { duration: '1m', target: 100 },    // Stay normal
        { duration: '10s', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'spike' },
      exec: 'spikeTest',
    },

    // Scenario 5: Soak Test - Sustained load
    soak: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '1h',
      tags: { test_type: 'soak' },
      exec: 'soakTest',
    },
  },

  thresholds: {
    // Error rate should be less than 1%
    'http_req_failed': ['rate<0.01'],

    // Response time thresholds
    'http_req_duration': [
      'p(95)<100',  // 95% of requests should be below 100ms
      'p(99)<500',  // 99% of requests should be below 500ms
      'p(99.9)<1000', // 99.9% should be below 1s
    ],

    // Custom thresholds
    'notification_created': ['rate>0.99'], // 99% success rate
    'notification_errors': ['count<100'],  // Less than 100 errors total
  },
};

// Helper function to make authenticated request
function createNotification(payload) {
  const url = `${BASE_URL}/notifications`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    tags: { name: 'CreateNotification' },
  };

  const response = http.post(url, JSON.stringify(payload), params);

  // Record custom metrics
  notificationLatency.add(response.timings.duration);

  // Check response
  const success = check(response, {
    'status is 201': (r) => r.status === 201,
    'has notification id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id !== undefined;
      } catch (e) {
        return false;
      }
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  notificationCreatedRate.add(success);

  if (!success) {
    notificationErrors.add(1);
    console.error(`Failed request: ${response.status} ${response.body}`);
  }

  return response;
}

// Test functions for different scenarios

export function smokeTest() {
  const payload = generateNotificationPayload();
  createNotification(payload);
  sleep(1); // 1 request per second
}

export function loadTest() {
  const payload = generateNotificationPayload();
  createNotification(payload);
  sleep(randomIntBetween(1, 3)); // Variable think time
}

export function stressTest() {
  const payload = generateNotificationPayload();
  createNotification(payload);
  sleep(randomIntBetween(0.1, 1)); // Shorter think time
}

export function spikeTest() {
  const payload = generateNotificationPayload();
  createNotification(payload);
  sleep(randomIntBetween(0.1, 2)); // Variable think time
}

export function soakTest() {
  const payload = generateNotificationPayload();
  createNotification(payload);
  sleep(randomIntBetween(1, 3)); // Sustained moderate load
}

// Setup function - runs once before all scenarios
export function setup() {
  console.log('Starting load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test scenarios configured`);

  // Verify system is up
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`System health check failed: ${healthCheck.status}`);
  }

  console.log('Health check passed, starting test execution...');
}

// Teardown function - runs once after all scenarios
export function teardown(data) {
  console.log('Load test completed');
}

// Handle summary for custom reporting
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-tests/results/summary.json': JSON.stringify(data),
    'load-tests/results/summary.html': htmlReport(data),
  };
}

// Helper for text summary
function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '\n';
  summary += `${indent}Test Summary\n`;
  summary += `${indent}============\n\n`;

  // Metrics summary
  for (const [name, metric] of Object.entries(data.metrics)) {
    summary += `${indent}${name}:\n`;
    if (metric.type === 'trend') {
      summary += `${indent}  min=${metric.values.min.toFixed(2)}ms\n`;
      summary += `${indent}  avg=${metric.values.avg.toFixed(2)}ms\n`;
      summary += `${indent}  med=${metric.values.med.toFixed(2)}ms\n`;
      summary += `${indent}  p95=${metric.values['p(95)'].toFixed(2)}ms\n`;
      summary += `${indent}  p99=${metric.values['p(99)'].toFixed(2)}ms\n`;
      summary += `${indent}  max=${metric.values.max.toFixed(2)}ms\n`;
    } else if (metric.type === 'rate') {
      summary += `${indent}  rate=${(metric.values.rate * 100).toFixed(2)}%\n`;
    } else if (metric.type === 'counter') {
      summary += `${indent}  count=${metric.values.count}\n`;
    }
    summary += '\n';
  }

  return summary;
}

// Helper for HTML report
function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>k6 Load Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .pass { color: green; font-weight: bold; }
    .fail { color: red; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Load Test Report - Notification System</h1>
  <p><strong>Test Date:</strong> ${new Date().toISOString()}</p>

  <h2>Metrics Summary</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
      <th>Threshold</th>
      <th>Status</th>
    </tr>
    ${Object.entries(data.metrics).map(([name, metric]) => `
      <tr>
        <td>${name}</td>
        <td>${JSON.stringify(metric.values)}</td>
        <td>${metric.thresholds ? Object.keys(metric.thresholds).join(', ') : 'N/A'}</td>
        <td class="${metric.thresholds && Object.values(metric.thresholds).every(t => t.ok) ? 'pass' : 'fail'}">
          ${metric.thresholds && Object.values(metric.thresholds).every(t => t.ok) ? 'PASS' : 'FAIL'}
        </td>
      </tr>
    `).join('')}
  </table>

  <h2>Test Details</h2>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>
  `;
}
