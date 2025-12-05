# Load Testing Suite

Comprehensive load testing suite for the Notification System using k6.

## Prerequisites

Install k6:

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

## Performance Targets

- **Throughput**: 50,000 requests/second
- **P95 Latency**: < 100ms
- **P99 Latency**: < 500ms
- **Error Rate**: < 1%

## Test Scenarios

### 1. Smoke Test
Basic sanity check with 1 virtual user for 30 seconds.

```bash
k6 run --scenario smoke load-tests/notification-load-test.js
```

**Purpose**: Verify system is functional before running larger tests.

### 2. Load Test
Gradually ramp up to target load with multiple stages.

```bash
k6 run --scenario load load-tests/notification-load-test.js
```

**Stages**:
- 0-100 VUs over 2 minutes
- Hold at 100 VUs for 5 minutes
- 100-500 VUs over 2 minutes
- Hold at 500 VUs for 5 minutes
- 500-1000 VUs over 2 minutes
- Hold at 1000 VUs for 5 minutes
- Ramp down to 0 over 2 minutes

**Total Duration**: ~23 minutes

### 3. Stress Test
Push the system beyond normal limits to find breaking point.

```bash
k6 run --scenario stress load-tests/notification-load-test.js
```

**Stages**:
- Ramp to 1K VUs
- Ramp to 5K VUs
- Ramp to 10K VUs
- Ramp down

**Total Duration**: ~18 minutes

### 4. Spike Test
Sudden traffic surge to test system recovery.

```bash
k6 run --scenario spike load-tests/notification-load-test.js
```

**Pattern**:
- Normal load (100 VUs)
- Sudden spike to 5K VUs
- Return to normal
- Ramp down

**Total Duration**: ~6 minutes

### 5. Soak Test
Sustained load over extended period to identify memory leaks and degradation.

```bash
k6 run --scenario soak load-tests/notification-load-test.js
```

**Duration**: 1 hour at 1000 VUs

## Configuration

Set environment variables to customize test execution:

```bash
# Custom base URL
export BASE_URL=http://localhost:3000

# Authentication token
export AUTH_TOKEN=your-test-token

# Run test
k6 run --scenario load load-tests/notification-load-test.js
```

## Test Data

The test automatically generates realistic notification data:

- **Channels**: EMAIL, SMS, PUSH, IN_APP
- **Types**: TRANSACTIONAL, MARKETING, SYSTEM
- **Priorities**: LOW, MEDIUM, HIGH, URGENT
- **Users**: 10,000 unique users
- **Tenants**: 100 unique tenants

## Metrics

### Standard k6 Metrics

- `http_req_duration`: Request latency (p95, p99, max)
- `http_req_failed`: Failed request rate
- `http_reqs`: Total requests per second
- `vus`: Current virtual users
- `iterations`: Total completed iterations

### Custom Metrics

- `notification_created`: Success rate of notification creation
- `notification_latency`: End-to-end notification latency
- `notification_errors`: Total error count

## Thresholds

Tests will fail if:

- Error rate > 1%
- P95 latency > 100ms
- P99 latency > 500ms
- P99.9 latency > 1000ms
- Notification success rate < 99%

## Results

Test results are saved to:

- `load-tests/results/summary.json` - Machine-readable results
- `load-tests/results/summary.html` - Human-readable HTML report
- Standard output - Console summary

## Quick Start Guide

### 1. Prepare System

```bash
# Start all services
docker-compose up -d

# Verify health
curl http://localhost:3000/health
```

### 2. Run Smoke Test

```bash
k6 run --scenario smoke load-tests/notification-load-test.js
```

### 3. Run Load Test

```bash
# Create results directory
mkdir -p load-tests/results

# Run test
k6 run --scenario load load-tests/notification-load-test.js

# View results
open load-tests/results/summary.html
```

### 4. Monitor During Test

- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686
- Kafka UI: http://localhost:8080

## Troubleshooting

### Connection Refused

```
ERRO[0000] dial tcp [::1]:3000: connect: connection refused
```

**Solution**: Ensure application is running:
```bash
docker-compose ps
curl http://localhost:3000/health
```

### Too Many Open Files

```
ERRO[0000] too many open files
```

**Solution**: Increase file descriptor limit:
```bash
# macOS/Linux
ulimit -n 10000
```

### Out of Memory

```
ERRO[0000] cannot allocate memory
```

**Solution**: Reduce virtual users or use distributed execution.

## Best Practices

1. **Always run smoke test first** to verify system health
2. **Monitor system resources** during tests (CPU, memory, disk)
3. **Start with lower loads** and gradually increase
4. **Run tests from a separate machine** for accurate results
5. **Use realistic test data** that matches production patterns
6. **Monitor database connections** and Kafka consumer lag
7. **Save results** for comparison across test runs

## Example Workflow

```bash
#!/bin/bash

# Complete load test workflow

echo "Step 1: Smoke Test"
k6 run --scenario smoke load-tests/notification-load-test.js

if [ $? -eq 0 ]; then
  echo "Step 2: Load Test"
  k6 run --scenario load load-tests/notification-load-test.js

  echo "Step 3: Spike Test"
  k6 run --scenario spike load-tests/notification-load-test.js

  echo "All tests completed successfully!"
else
  echo "Smoke test failed, aborting"
  exit 1
fi
```

## Interpreting Results

### Good Results
```
✓ http_req_duration..............: avg=45ms   p95=85ms   p99=150ms
✓ http_req_failed................: 0.10%
✓ http_reqs......................: 50000/s
```

### Warning Signs
```
✗ http_req_duration..............: avg=250ms  p95=800ms  p99=2s
✗ http_req_failed................: 5.50%
  http_reqs......................: 5000/s
```

Action items for warnings:
1. Check database query performance
2. Review Kafka consumer lag
3. Verify cache hit rate
4. Check for resource exhaustion
5. Review error logs

## Advanced Usage

### Custom VU Count

```bash
k6 run --vus 500 --duration 5m load-tests/notification-load-test.js
```

### Cloud Execution

```bash
# Run test in k6 Cloud
k6 cloud load-tests/notification-load-test.js
```

### Distributed Execution

```bash
# Run test across multiple machines
k6 run --out cloud load-tests/notification-load-test.js
```

## Support

For issues or questions:
1. Check application logs: `docker-compose logs app`
2. Review Grafana dashboards
3. Check Prometheus alerts
4. Review k6 documentation: https://k6.io/docs/
