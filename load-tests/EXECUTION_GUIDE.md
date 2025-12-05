# Load Testing Execution Guide

This guide provides step-by-step instructions for executing load tests and optimizing the notification system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Test Execution Workflow](#test-execution-workflow)
- [Baseline Load Test](#baseline-load-test)
- [Incremental Load Testing](#incremental-load-testing)
- [Performance Monitoring](#performance-monitoring)
- [Bottleneck Identification](#bottleneck-identification)
- [Optimization Strategies](#optimization-strategies)
- [Performance Report Template](#performance-report-template)

---

## Prerequisites

### 1. System Preparation

```bash
# Ensure all services are running
docker-compose ps

# Verify health endpoints
curl http://localhost:3000/health
curl http://localhost:3000/health/worker
curl http://localhost:3000/health/database

# Check monitoring stack
curl http://localhost:9090/-/healthy  # Prometheus
curl http://localhost:3001/api/health # Grafana

# Flush Redis to start fresh
docker exec notification-redis redis-cli FLUSHALL

# Optional: Reset database to baseline state
npm run prisma:migrate reset
npm run prisma:seed
```

### 2. Monitoring Setup

Open the following dashboards in separate browser tabs:

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **Kafka UI**: http://localhost:8080

### 3. System Resource Monitoring

```bash
# Terminal 1: Watch Docker resource usage
docker stats

# Terminal 2: Watch application logs
docker-compose logs -f app

# Terminal 3: Watch Kafka consumer lag
watch -n 5 'docker exec notification-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --group notification-workers'
```

---

## Test Execution Workflow

### Phase 1: Smoke Test (5 minutes)

**Purpose**: Verify system is functional before running larger tests.

```bash
# Create results directory
mkdir -p load-tests/results

# Run smoke test
k6 run --scenario smoke load-tests/notification-load-test.js

# Expected results:
# - 0 errors
# - All checks pass
# - p95 < 100ms
```

**Success Criteria**:
- ✅ 0% error rate
- ✅ All health checks pass
- ✅ p95 latency < 100ms

### Phase 2: Baseline Test (15 minutes)

**Purpose**: Establish performance baseline with moderate load.

```bash
# Run baseline load test (100-500 VUs)
k6 run --scenario load load-tests/notification-load-test.js \
  > load-tests/results/baseline-run-$(date +%Y%m%d_%H%M%S).log

# Save Prometheus snapshot
curl -X POST http://localhost:9090/api/v1/admin/tsdb/snapshot
```

**Record Metrics**:
- Throughput (req/s)
- p50, p95, p99 latency
- Error rate
- CPU usage
- Memory usage
- Database connections
- Kafka consumer lag
- Cache hit rate

### Phase 3: Incremental Load Testing (2-3 hours)

**Purpose**: Identify breaking points and bottlenecks.

```bash
# Test 1: 1,000 VUs (low load)
k6 run --vus 1000 --duration 10m load-tests/notification-load-test.js

# Test 2: 2,500 VUs (medium load)
k6 run --vus 2500 --duration 10m load-tests/notification-load-test.js

# Test 3: 5,000 VUs (high load)
k6 run --vus 5000 --duration 10m load-tests/notification-load-test.js

# Test 4: 10,000 VUs (stress test)
k6 run --scenario stress load-tests/notification-load-test.js
```

**Between each test**:
1. Wait 5 minutes for system to stabilize
2. Check for errors in logs
3. Verify Kafka consumer lag is cleared
4. Record metrics in performance report

### Phase 4: Spike Test (10 minutes)

**Purpose**: Test system recovery from sudden traffic surge.

```bash
k6 run --scenario spike load-tests/notification-load-test.js
```

**Watch for**:
- How quickly system responds to spike
- Whether errors occur during spike
- Time to recover after spike
- Kafka consumer lag during/after spike

### Phase 5: Soak Test (1 hour) - Optional

**Purpose**: Identify memory leaks and long-term degradation.

```bash
# Run 1-hour sustained load
k6 run --scenario soak load-tests/notification-load-test.js
```

**Monitor**:
- Memory usage over time (should be stable)
- CPU usage (should be consistent)
- Error rate (should remain low)
- Database connection pool (should not grow)

---

## Baseline Load Test

### Step 1: Pre-Test Checklist

```bash
# 1. Verify system health
curl http://localhost:3000/health | jq

# 2. Check database connection pool
curl http://localhost:3000/health/database | jq

# 3. Check Redis
docker exec notification-redis redis-cli INFO stats

# 4. Check Kafka topics
docker exec notification-kafka kafka-topics \
  --list --bootstrap-server localhost:9092

# 5. Create test user with ADMIN role
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@example.com",
    "password": "LoadTest123!",
    "name": "Load Test User"
  }'

# 6. Get auth token and save to environment
export AUTH_TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"loadtest@example.com","password":"LoadTest123!"}' \
  | jq -r '.access_token')

echo $AUTH_TOKEN  # Verify token exists
```

### Step 2: Run Baseline Test

```bash
# Run load test with baseline configuration
k6 run --scenario load \
  --env AUTH_TOKEN=$AUTH_TOKEN \
  --out json=load-tests/results/baseline-$(date +%Y%m%d_%H%M%S).json \
  load-tests/notification-load-test.js
```

### Step 3: Collect Baseline Metrics

```bash
# Query Prometheus for baseline metrics
curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=rate(http_requests_total[5m])' | jq

curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))' | jq

# Check database query performance
docker exec notification-postgres psql -U notification_user -d notification_db -c \
  "SELECT query, calls, mean_exec_time, max_exec_time
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;"

# Check Redis stats
docker exec notification-redis redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Calculate cache hit rate
docker exec notification-redis redis-cli INFO stats | awk '
  /keyspace_hits/ { hits=$2 }
  /keyspace_misses/ { misses=$2 }
  END { print "Cache Hit Rate: " (hits/(hits+misses)*100) "%" }
'
```

---

## Incremental Load Testing

### Load Levels

| Level | VUs | Expected RPS | Duration | Purpose |
|-------|-----|--------------|----------|---------|
| 1 | 100 | ~1,000 | 5m | Baseline |
| 2 | 500 | ~5,000 | 10m | Normal load |
| 3 | 1,000 | ~10,000 | 10m | High load |
| 4 | 2,500 | ~25,000 | 10m | Peak load |
| 5 | 5,000 | ~50,000 | 10m | Target load |
| 6 | 10,000 | ~100,000 | 5m | Stress test |

### Execution Script

```bash
#!/bin/bash

# Load testing execution script
set -e

RESULTS_DIR="load-tests/results/incremental-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

echo "Starting incremental load testing..."
echo "Results will be saved to: $RESULTS_DIR"

# Function to run test and collect metrics
run_test() {
  local vus=$1
  local duration=$2
  local level=$3

  echo "========================================="
  echo "Level $level: Testing with $vus VUs for $duration"
  echo "========================================="

  # Run k6 test
  k6 run --vus $vus --duration $duration \
    --env AUTH_TOKEN=$AUTH_TOKEN \
    --out json="$RESULTS_DIR/level-$level-$vus-vus.json" \
    load-tests/notification-load-test.js \
    | tee "$RESULTS_DIR/level-$level-$vus-vus.log"

  # Wait for system to stabilize
  echo "Waiting 2 minutes for system to stabilize..."
  sleep 120

  # Collect metrics
  echo "Collecting metrics..."

  # Prometheus metrics
  curl -G http://localhost:9090/api/v1/query \
    --data-urlencode 'query=rate(http_requests_total[5m])' \
    > "$RESULTS_DIR/level-$level-prometheus-rps.json"

  curl -G http://localhost:9090/api/v1/query \
    --data-urlencode 'query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))' \
    > "$RESULTS_DIR/level-$level-prometheus-p95.json"

  # Database metrics
  docker exec notification-postgres psql -U notification_user -d notification_db -c \
    "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;" \
    > "$RESULTS_DIR/level-$level-db-queries.txt"

  # Kafka consumer lag
  docker exec notification-kafka kafka-consumer-groups \
    --bootstrap-server localhost:9092 \
    --describe --group notification-workers \
    > "$RESULTS_DIR/level-$level-kafka-lag.txt"

  echo "Level $level complete!"
  echo ""
}

# Run tests at each level
run_test 100 "5m" 1
run_test 500 "10m" 2
run_test 1000 "10m" 3
run_test 2500 "10m" 4
run_test 5000 "10m" 5
run_test 10000 "5m" 6

echo "========================================="
echo "Incremental load testing complete!"
echo "Results saved to: $RESULTS_DIR"
echo "========================================="

# Generate summary report
cat > "$RESULTS_DIR/SUMMARY.md" << EOF
# Load Testing Summary

**Date**: $(date)
**Results Directory**: $RESULTS_DIR

## Test Levels

| Level | VUs | Duration | Log File |
|-------|-----|----------|----------|
| 1 | 100 | 5m | level-1-100-vus.log |
| 2 | 500 | 10m | level-2-500-vus.log |
| 3 | 1,000 | 10m | level-3-1000-vus.log |
| 4 | 2,500 | 10m | level-4-2500-vus.log |
| 5 | 5,000 | 10m | level-5-5000-vus.log |
| 6 | 10,000 | 5m | level-6-10000-vus.log |

## Next Steps

1. Review log files for errors
2. Analyze Prometheus metrics
3. Identify bottlenecks
4. Apply optimizations
5. Re-run tests
EOF

echo "Summary report generated: $RESULTS_DIR/SUMMARY.md"
```

---

## Performance Monitoring

### Key Metrics to Monitor

#### 1. Application Metrics

```promql
# Throughput (requests per second)
rate(http_requests_total[5m])

# P95 Latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# P99 Latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_request_errors_total[5m]) / rate(http_requests_total[5m])

# Notification success rate
rate(notifications_total[5m]) - rate(notifications_failed_total[5m])
```

#### 2. Kafka Metrics

```promql
# Messages published per second
rate(kafka_messages_published_total[5m])

# Messages consumed per second
rate(kafka_messages_consumed_total[5m])

# Consumer lag
kafka_consumer_lag

# Publish errors
rate(kafka_publish_errors_total[5m])
```

#### 3. Database Metrics

```promql
# Query duration P95
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))

# Active connections
db_connections_active

# Query errors
rate(db_query_errors_total[5m])
```

#### 4. Cache Metrics

```promql
# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Cache operation duration
histogram_quantile(0.95, rate(cache_operation_duration_seconds_bucket[5m]))
```

#### 5. System Resources

```bash
# CPU usage per container
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemPerc}}\t{{.MemUsage}}"

# Disk I/O
iostat -x 5 3

# Network I/O
iftop -t -s 5
```

---

## Bottleneck Identification

### Common Bottlenecks and Detection

#### 1. Database Bottleneck

**Symptoms**:
- High p95 database query latency (> 500ms)
- Active connections approaching pool limit
- Slow query logs showing frequent queries

**Detection**:
```bash
# Check slow queries
docker exec notification-postgres psql -U notification_user -d notification_db -c \
  "SELECT query, calls, mean_exec_time, max_exec_time
   FROM pg_stat_statements
   WHERE mean_exec_time > 100
   ORDER BY mean_exec_time DESC
   LIMIT 10;"

# Check connection pool usage
docker exec notification-postgres psql -U notification_user -d notification_db -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check table bloat
docker exec notification-postgres psql -U notification_user -d notification_db -c \
  "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

**Solutions**: See [Database Optimizations](#database-optimizations)

#### 2. Kafka Consumer Lag

**Symptoms**:
- Consumer lag > 1000 messages
- Messages consumed/sec < messages published/sec
- Increasing queue depth over time

**Detection**:
```bash
# Check consumer lag
docker exec notification-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --group notification-workers

# Check topic details
docker exec notification-kafka kafka-topics \
  --describe --topic notifications \
  --bootstrap-server localhost:9092
```

**Solutions**: See [Kafka Optimizations](#kafka-optimizations)

#### 3. Cache Inefficiency

**Symptoms**:
- Cache hit rate < 70%
- High database query volume
- Increased latency on cached endpoints

**Detection**:
```bash
# Check cache hit rate
docker exec notification-redis redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Check cache memory usage
docker exec notification-redis redis-cli INFO memory | grep used_memory_human

# Check cache key count
docker exec notification-redis redis-cli DBSIZE
```

**Solutions**: See [Cache Optimizations](#cache-optimizations)

#### 4. CPU Bottleneck

**Symptoms**:
- CPU usage > 80% consistently
- High p95 latency across all endpoints
- Request queuing

**Detection**:
```bash
# Check CPU usage per container
docker stats --no-stream

# Check Node.js CPU profiling
# (requires profiling enabled in application)
```

**Solutions**: See [CPU Optimizations](#cpu-optimizations)

#### 5. Memory Bottleneck

**Symptoms**:
- Memory usage > 80%
- Garbage collection pauses
- Out of memory errors

**Detection**:
```bash
# Check memory usage
docker stats --no-stream

# Check for memory leaks (soak test)
# Monitor memory over 1 hour - should be stable
```

**Solutions**: See [Memory Optimizations](#memory-optimizations)

---

## Optimization Strategies

### Database Optimizations

#### 1. Add Missing Indexes

```sql
-- Analyze query patterns
SELECT query, calls, mean_exec_time, rows
FROM pg_stat_statements
WHERE mean_exec_time > 50
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Common indexes to add
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_status_created
  ON notifications (userId, status, createdAt DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_scheduled
  ON notifications (status, scheduledFor)
  WHERE status = 'SCHEDULED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_correlation
  ON notifications (correlationId, createdAt)
  WHERE correlationId IS NOT NULL;

-- Analyze tables after adding indexes
ANALYZE notifications;
ANALYZE events;
ANALYZE users;
```

#### 2. Optimize Connection Pool

Update `.env`:
```bash
# Increase connection pool size
DATABASE_URL="postgresql://notification_user:notification_password@localhost:5432/notification_db?schema=public&connection_limit=20&pool_timeout=30"
```

#### 3. Query Optimization

```typescript
// Before: N+1 query problem
const notifications = await prisma.notification.findMany();
for (const notif of notifications) {
  const user = await prisma.user.findUnique({ where: { id: notif.userId } });
}

// After: Use include to join
const notifications = await prisma.notification.findMany({
  include: { user: true },
});

// Use select to fetch only needed fields
const notifications = await prisma.notification.findMany({
  select: {
    id: true,
    type: true,
    status: true,
    createdAt: true,
  },
});
```

#### 4. Implement Read Replicas (Advanced)

```typescript
// PrismaService with read replica
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readReplica: PrismaClient;

  async onModuleInit() {
    await this.$connect();

    // Connect to read replica
    this.readReplica = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_READ_REPLICA_URL,
        },
      },
    });
    await this.readReplica.$connect();
  }

  // Use read replica for queries
  async findManyNotifications(args: any) {
    return this.readReplica.notification.findMany(args);
  }

  // Use primary for writes
  async createNotification(data: any) {
    return this.notification.create({ data });
  }
}
```

### Kafka Optimizations

#### 1. Increase Partitions

```bash
# Increase partition count to match number of consumers
docker exec notification-kafka kafka-topics \
  --bootstrap-server localhost:9092 \
  --alter --topic notifications --partitions 10
```

#### 2. Enable Compression

```typescript
// KafkaProducerService
async sendNotification(message: NotificationMessage): Promise<void> {
  await this.producer.send({
    topic: 'notifications',
    compression: CompressionTypes.GZIP,  // Add compression
    messages: [{
      key: message.userId,
      value: JSON.stringify(message),
    }],
  });
}
```

#### 3. Batch Message Production

```typescript
// Batch notifications for efficiency
async sendNotificationBatch(messages: NotificationMessage[]): Promise<void> {
  const kafkaMessages = messages.map(msg => ({
    key: msg.userId,
    value: JSON.stringify(msg),
  }));

  await this.producer.send({
    topic: 'notifications',
    compression: CompressionTypes.GZIP,
    messages: kafkaMessages,
  });
}
```

#### 4. Scale Consumers

```bash
# Run multiple consumer instances
docker-compose up --scale app=3
```

### Cache Optimizations

#### 1. Increase TTL for Stable Data

```typescript
// src/common/constants.ts
export const CACHE_TTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  LONG: 3600,          // 1 hour
  DAY: 86400,          // 24 hours
  WEEK: 604800,        // 7 days (for very stable data)
} as const;
```

#### 2. Implement Cache Warming

```typescript
// src/jobs/cache-warming.job.ts
@Injectable()
export class CacheWarmingJob {
  constructor(
    private readonly cacheService: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 * * * *')  // Every hour
  async warmCache() {
    // Preload top 100 active users
    const users = await this.prisma.user.findMany({
      take: 100,
      orderBy: { updatedAt: 'desc' },
    });

    for (const user of users) {
      const key = `user:${user.id}`;
      await this.cacheService.set(key, user, CACHE_TTL.LONG);
    }
  }
}
```

#### 3. Add Caching to Hot Paths

```typescript
// NotificationService
async findById(id: string): Promise<Notification> {
  const cacheKey = `notification:${id}`;

  return this.cacheService.getOrSet(
    cacheKey,
    async () => {
      return this.prisma.notification.findUnique({ where: { id } });
    },
    CACHE_TTL.MEDIUM,
  );
}
```

### CPU Optimizations

#### 1. Enable Clustering

```typescript
// main.ts
import * as cluster from 'cluster';
import * as os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();  // Restart worker
  });
} else {
  // Worker process
  async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    await app.listen(3000);
  }
  bootstrap();
}
```

#### 2. Optimize Heavy Computations

```typescript
// Move heavy processing to worker threads
import { Worker } from 'worker_threads';

async function processNotificationAsync(data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./notification-processor.worker.js', {
      workerData: data,
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}
```

### Memory Optimizations

#### 1. Stream Large Datasets

```typescript
// Instead of loading all notifications into memory
async exportNotifications(): Promise<void> {
  const stream = await this.prisma.notification.findManyStream({
    where: { createdAt: { gte: new Date('2025-01-01') } },
  });

  for await (const notification of stream) {
    // Process one at a time
    await this.writeToFile(notification);
  }
}
```

#### 2. Implement Pagination

```typescript
// NotificationService
async findMany(params: {
  skip?: number;
  take?: number;
}): Promise<{ data: Notification[]; total: number }> {
  const { skip = 0, take = 50 } = params;

  const [data, total] = await Promise.all([
    this.prisma.notification.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.notification.count(),
  ]);

  return { data, total };
}
```

---

## Performance Report Template

Create `load-tests/results/PERFORMANCE_REPORT.md`:

```markdown
# Performance Test Report

**Date**: [DATE]
**System Version**: v1.0.0
**Test Duration**: [DURATION]
**Test Engineer**: [NAME]

---

## Executive Summary

- **Target Throughput**: 50,000 req/sec
- **Achieved Throughput**: [X] req/sec
- **Target Met**: ✅ Yes / ❌ No
- **Critical Issues Found**: [COUNT]
- **Optimizations Applied**: [COUNT]

---

## Test Environment

- **Application Instances**: 1
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Message Queue**: Kafka 3.6
- **Hardware**:
  - CPU: [CORES] cores
  - Memory: [SIZE] GB
  - Disk: [TYPE]

---

## Test Results

### Baseline Test (100 VUs)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Throughput | 1,250 req/s | 1,000 req/s | ✅ |
| P95 Latency | 45ms | 100ms | ✅ |
| P99 Latency | 89ms | 500ms | ✅ |
| Error Rate | 0.02% | 1% | ✅ |
| CPU Usage | 15% | <80% | ✅ |
| Memory Usage | 250MB | <2GB | ✅ |
| DB Connections | 5 | <100 | ✅ |
| Kafka Lag | 0 | <1000 | ✅ |
| Cache Hit Rate | 85% | >70% | ✅ |

### Load Test (1,000 VUs)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Throughput | 12,500 req/s | 10,000 req/s | ✅ |
| P95 Latency | 75ms | 100ms | ✅ |
| P99 Latency | 150ms | 500ms | ✅ |
| Error Rate | 0.15% | 1% | ✅ |
| CPU Usage | 45% | <80% | ✅ |
| Memory Usage | 750MB | <2GB | ✅ |
| DB Connections | 15 | <100 | ✅ |
| Kafka Lag | 50 | <1000 | ✅ |
| Cache Hit Rate | 80% | >70% | ✅ |

### Stress Test (5,000 VUs)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Throughput | 48,500 req/s | 50,000 req/s | ⚠️ |
| P95 Latency | 250ms | 100ms | ❌ |
| P99 Latency | 800ms | 500ms | ❌ |
| Error Rate | 2.5% | 1% | ❌ |
| CPU Usage | 92% | <80% | ❌ |
| Memory Usage | 1.8GB | <2GB | ⚠️ |
| DB Connections | 95 | <100 | ⚠️ |
| Kafka Lag | 2500 | <1000 | ❌ |
| Cache Hit Rate | 65% | >70% | ❌ |

---

## Bottlenecks Identified

### 1. Database Connection Pool Exhaustion
- **Severity**: High
- **Observed At**: 5,000 VUs
- **Symptom**: P95 latency increased to 250ms, connections approaching pool limit
- **Root Cause**: Default pool size of 10 connections insufficient for high load
- **Impact**: 2.5% error rate, increased latency

### 2. Kafka Consumer Lag
- **Severity**: High
- **Observed At**: 5,000 VUs
- **Symptom**: Consumer lag reached 2,500 messages
- **Root Cause**: Single consumer instance cannot keep up with message production rate
- **Impact**: Delayed notification delivery (5+ seconds)

### 3. CPU Saturation
- **Severity**: Medium
- **Observed At**: 5,000 VUs
- **Symptom**: CPU usage at 92%
- **Root Cause**: Single-threaded Node.js process, no clustering enabled
- **Impact**: Increased latency, reduced throughput

### 4. Cache Hit Rate Degradation
- **Severity**: Medium
- **Observed At**: 5,000 VUs
- **Symptom**: Cache hit rate dropped to 65%
- **Root Cause**: Cache keys evicted due to TTL expiration under high load
- **Impact**: Increased database queries, higher latency

---

## Optimizations Applied

### 1. Database Optimizations

**Changes**:
- Increased connection pool from 10 to 20
- Added composite indexes on (userId, status, createdAt)
- Enabled prepared statement caching

**Results**:
- P95 latency improved: 250ms → 95ms
- Error rate reduced: 2.5% → 0.3%
- Connection pool utilization: 95% → 60%

### 2. Kafka Optimizations

**Changes**:
- Scaled consumer instances from 1 to 3
- Increased topic partitions from 3 to 10
- Enabled GZIP compression

**Results**:
- Consumer lag reduced: 2500 → 0
- Message processing latency: 150ms → 45ms
- Kafka network bandwidth reduced by 40%

### 3. CPU Optimizations

**Changes**:
- Enabled Node.js clustering (4 workers)
- Moved heavy processing to worker threads

**Results**:
- CPU utilization: 92% → 65%
- Throughput increased: 48,500 → 62,000 req/s
- P95 latency improved: 250ms → 75ms

### 4. Cache Optimizations

**Changes**:
- Increased TTL for user data: 5min → 15min
- Implemented cache warming for top 1000 users
- Added caching to hot paths

**Results**:
- Cache hit rate improved: 65% → 88%
- Database query volume reduced by 35%
- P95 latency improved: 95ms → 60ms

---

## Post-Optimization Results

### Final Stress Test (5,000 VUs)

| Metric | Before | After | Improvement | Status |
|--------|--------|-------|-------------|--------|
| Throughput | 48,500 req/s | 62,000 req/s | +27.8% | ✅ |
| P95 Latency | 250ms | 60ms | -76.0% | ✅ |
| P99 Latency | 800ms | 180ms | -77.5% | ✅ |
| Error Rate | 2.5% | 0.3% | -88.0% | ✅ |
| CPU Usage | 92% | 65% | -29.3% | ✅ |
| Memory Usage | 1.8GB | 1.5GB | -16.7% | ✅ |
| DB Connections | 95 | 45 | -52.6% | ✅ |
| Kafka Lag | 2500 | 0 | -100% | ✅ |
| Cache Hit Rate | 65% | 88% | +35.4% | ✅ |

### Target Achievement

✅ **Target Met**: System now handles 62,000 req/sec (124% of target)

---

## Recommendations

### Immediate (Production Ready)
1. ✅ Apply all optimizations from this report
2. ✅ Deploy with 3 application instances
3. ✅ Enable database connection pooling (size: 20)
4. ✅ Configure 10 Kafka partitions

### Short-term (Next Sprint)
1. Implement auto-scaling based on CPU/memory metrics
2. Add read replicas for database
3. Implement request-level caching with Redis
4. Add circuit breakers with automatic failover

### Long-term (Next Quarter)
1. Migrate to distributed caching (Redis Cluster)
2. Implement event sourcing for complete audit trail
3. Add multi-region deployment for geo-distributed load
4. Implement GraphQL for flexible client queries

---

## Conclusion

The notification system successfully achieved the target of 50,000 req/sec after applying database, Kafka, CPU, and cache optimizations. The system demonstrated:

- **High throughput**: 62,000 req/sec (124% of target)
- **Low latency**: p95 at 60ms, p99 at 180ms
- **High reliability**: 99.7% success rate
- **Efficient resource usage**: 65% CPU, 1.5GB memory

The system is production-ready and can handle peak loads with headroom for growth.

**Test Conducted By**: [Name]
**Reviewed By**: [Tech Lead]
**Approved By**: [Engineering Manager]
```

---

## Post-Optimization Verification

After applying optimizations, re-run tests to verify improvements:

```bash
# 1. Restart services with optimizations
docker-compose down
docker-compose up -d

# 2. Wait for services to stabilize
sleep 30

# 3. Run smoke test
k6 run --scenario smoke load-tests/notification-load-test.js

# 4. Re-run baseline test
k6 run --scenario load load-tests/notification-load-test.js

# 5. Re-run stress test
k6 run --scenario stress load-tests/notification-load-test.js

# 6. Compare results
diff -u \
  load-tests/results/baseline-before.log \
  load-tests/results/baseline-after.log
```

---

## Troubleshooting

### Test Fails Immediately

```bash
# Check if services are running
docker-compose ps

# Check application logs
docker-compose logs app

# Verify health endpoint
curl http://localhost:3000/health
```

### High Error Rate

```bash
# Check application errors
docker logs notification-api 2>&1 | grep ERROR

# Check database connectivity
docker exec notification-postgres pg_isready

# Check Redis connectivity
docker exec notification-redis redis-cli ping
```

### Kafka Consumer Lag Increasing

```bash
# Check consumer status
docker exec notification-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --group notification-workers

# Scale up consumers
docker-compose up --scale app=3
```

### Out of Memory

```bash
# Check memory usage
docker stats

# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory → 8GB

# Restart services
docker-compose restart
```

---

## Next Steps

1. ✅ Complete baseline and incremental load tests
2. ✅ Identify and document bottlenecks
3. ✅ Apply optimizations
4. ✅ Re-run tests to verify improvements
5. ✅ Create performance report
6. ✅ Review with team
7. ✅ Deploy to staging for validation
8. ✅ Plan production rollout

---

## Appendix

### Useful Commands

```bash
# Reset test environment
docker-compose down -v
docker-compose up -d
npm run prisma:migrate reset
npm run prisma:seed

# Monitor resources during test
watch -n 1 'docker stats --no-stream'

# Export Prometheus data
curl -G http://localhost:9090/api/v1/query_range \
  --data-urlencode 'query=rate(http_requests_total[5m])' \
  --data-urlencode 'start=2025-12-05T00:00:00Z' \
  --data-urlencode 'end=2025-12-05T23:59:59Z' \
  --data-urlencode 'step=15s' \
  > prometheus-export.json

# View Jaeger traces for slow requests
open http://localhost:16686
# Service: notification-system
# Operation: POST /notifications
# Tags: error=true
```

### References

- [k6 Documentation](https://k6.io/docs/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [NestJS Performance](https://docs.nestjs.com/techniques/performance)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Kafka Performance Tuning](https://kafka.apache.org/documentation/#producerconfigs)
