# Monitoring & Alerting Guide

Comprehensive guide to monitoring, metrics, and alerting for the Notification System.

---

## Document Information

- **Version**: 1.0.0
- **Last Updated**: December 7, 2025
- **Maintained By**: Platform Engineering Team

---

## Table of Contents

1. [Overview](#overview)
2. [Metrics Catalog](#metrics-catalog)
3. [Dashboards](#dashboards)
4. [Alerting Rules](#alerting-rules)
5. [Log Analysis](#log-analysis)
6. [Distributed Tracing](#distributed-tracing)
7. [Health Checks](#health-checks)
8. [Performance Baselines](#performance-baselines)
9. [Troubleshooting Guide](#troubleshooting-guide)

---

## Overview

### Observability Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      Application                             │
│  (Metrics, Logs, Traces instrumented via OpenTelemetry)    │
└───────────────┬─────────────────┬──────────────┬────────────┘
                │                 │              │
        ┌───────▼────────┐ ┌─────▼──────┐ ┌────▼─────┐
        │   Prometheus   │ │    Pino    │ │  Jaeger  │
        │   (Metrics)    │ │   (Logs)   │ │ (Traces) │
        └───────┬────────┘ └─────┬──────┘ └────┬─────┘
                │                 │              │
        ┌───────▼─────────────────▼──────────────▼─────┐
        │               Grafana                         │
        │  (Dashboards, Visualizations, Alerts)        │
        └──────────────────────────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │  Alertmanager  │
                        │  (PagerDuty,   │
                        │   Slack, etc)  │
                        └────────────────┘
```

### Four Golden Signals

We monitor the Four Golden Signals from Google's SRE book:

1. **Latency**: How long it takes to serve a request
2. **Traffic**: How much demand is placed on the system
3. **Errors**: Rate of requests that fail
4. **Saturation**: How "full" the service is

---

## Metrics Catalog

### HTTP Request Metrics

#### `http_requests_total`

**Type**: Counter

**Description**: Total number of HTTP requests received.

**Labels**:
- `method`: HTTP method (GET, POST, PUT, DELETE, PATCH)
- `status_code`: HTTP status code (200, 400, 500, etc.)
- `path`: API endpoint path (e.g., `/notifications`, `/users`)

**Usage**:
```promql
# Request rate (requests per second)
rate(http_requests_total[5m])

# Success rate (200-299 responses)
rate(http_requests_total{status_code=~"2.."}[5m])

# Error rate (500+ responses)
rate(http_requests_total{status_code=~"5.."}[5m])

# Requests by endpoint
sum by (path) (rate(http_requests_total[5m]))
```

**Alert Threshold**: > 10% error rate for 5 minutes

---

#### `http_request_duration_seconds`

**Type**: Histogram

**Description**: HTTP request duration in seconds.

**Buckets**: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10

**Labels**:
- `method`: HTTP method
- `path`: API endpoint path
- `status_code`: HTTP status code

**Usage**:
```promql
# P50 latency (median)
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# P99 latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Average latency
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# Slow endpoints (P95 > 100ms)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.1
```

**Alert Threshold**: P95 > 100ms or P99 > 500ms for 5 minutes

---

### Notification Metrics

#### `notifications_total`

**Type**: Counter

**Description**: Total number of notifications created.

**Labels**:
- `channel`: Notification channel (EMAIL, SMS, PUSH, IN_APP)
- `priority`: Priority level (LOW, MEDIUM, HIGH, URGENT)
- `status`: Current status (PENDING, SENT, FAILED, etc.)

**Usage**:
```promql
# Notifications created per second
rate(notifications_total[5m])

# Notifications by channel
sum by (channel) (rate(notifications_total[5m]))

# Notifications by status
sum by (status) (rate(notifications_total[5m]))

# Failed notifications
sum(rate(notifications_total{status="FAILED"}[5m]))
```

**Alert Threshold**: Failure rate > 5% for 5 minutes

---

#### `notifications_failed_total`

**Type**: Counter

**Description**: Total number of failed notifications.

**Labels**:
- `channel`: Notification channel
- `reason`: Failure reason (PROVIDER_ERROR, INVALID_PAYLOAD, TIMEOUT, etc.)

**Usage**:
```promql
# Failure rate by reason
sum by (reason) (rate(notifications_failed_total[5m]))

# Provider-specific failures
sum by (channel, reason) (rate(notifications_failed_total[5m]))
```

**Alert Threshold**: > 10 failures per minute

---

#### `notification_delivery_duration_seconds`

**Type**: Histogram

**Description**: Time taken to deliver a notification to external provider.

**Buckets**: 0.1, 0.5, 1, 2, 5, 10, 30, 60

**Labels**:
- `channel`: Notification channel
- `provider`: Provider name (sendgrid, twilio, firebase)

**Usage**:
```promql
# P95 delivery time
histogram_quantile(0.95, rate(notification_delivery_duration_seconds_bucket[5m]))

# Delivery time by provider
histogram_quantile(0.95,
  rate(notification_delivery_duration_seconds_bucket[5m])
) by (provider)
```

**Alert Threshold**: P95 > 10 seconds

---

### Kafka Metrics

#### `kafka_messages_published_total`

**Type**: Counter

**Description**: Total number of messages published to Kafka.

**Labels**:
- `topic`: Kafka topic name (notifications, notifications.retry, notifications.dlq)

**Usage**:
```promql
# Messages published per second
rate(kafka_messages_published_total[5m])

# Messages by topic
sum by (topic) (rate(kafka_messages_published_total[5m]))
```

---

#### `kafka_messages_consumed_total`

**Type**: Counter

**Description**: Total number of messages consumed from Kafka.

**Labels**:
- `topic`: Kafka topic name
- `status`: Processing status (success, failed)

**Usage**:
```promql
# Messages consumed per second
rate(kafka_messages_consumed_total[5m])

# Consumer throughput by topic
sum by (topic) (rate(kafka_messages_consumed_total[5m]))

# Failed message rate
rate(kafka_messages_consumed_total{status="failed"}[5m])
```

---

#### `kafka_consumer_lag`

**Type**: Gauge

**Description**: Number of messages waiting to be consumed (consumer lag).

**Labels**:
- `topic`: Kafka topic name
- `partition`: Partition number

**Usage**:
```promql
# Current consumer lag
kafka_consumer_lag

# Total lag across all partitions
sum(kafka_consumer_lag)

# Lag by topic
sum by (topic) (kafka_consumer_lag)
```

**Alert Threshold**: > 1000 messages for 5 minutes

---

### Database Metrics

#### `db_query_duration_seconds`

**Type**: Histogram

**Description**: Database query execution time.

**Buckets**: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5

**Labels**:
- `operation`: Database operation (findUnique, findMany, create, update, delete)
- `model`: Prisma model name (User, Notification, Event)

**Usage**:
```promql
# P95 query time
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))

# Slow queries (P95 > 100ms)
histogram_quantile(0.95,
  rate(db_query_duration_seconds_bucket[5m])
) > 0.1

# Query time by operation
histogram_quantile(0.95,
  rate(db_query_duration_seconds_bucket[5m])
) by (operation)
```

**Alert Threshold**: P95 > 100ms

---

#### `db_connections_active`

**Type**: Gauge

**Description**: Number of active database connections.

**Usage**:
```promql
# Current active connections
db_connections_active

# Connection pool usage (%)
(db_connections_active / db_connections_max) * 100
```

**Alert Threshold**: > 80% of max connections

---

#### `db_errors_total`

**Type**: Counter

**Description**: Total number of database errors.

**Labels**:
- `error_type`: Error type (connection_error, query_error, timeout)

**Usage**:
```promql
# Database error rate
rate(db_errors_total[5m])

# Errors by type
sum by (error_type) (rate(db_errors_total[5m]))
```

**Alert Threshold**: > 10 errors per minute

---

### Cache Metrics

#### `cache_hits_total`

**Type**: Counter

**Description**: Total number of cache hits.

**Labels**:
- `key_pattern`: Cache key pattern (user:*, notification:*, etc.)

**Usage**:
```promql
# Cache hit rate
rate(cache_hits_total[5m]) /
  (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Hit rate percentage
(rate(cache_hits_total[5m]) /
  (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))) * 100
```

**Target**: > 80% hit rate

---

#### `cache_misses_total`

**Type**: Counter

**Description**: Total number of cache misses.

**Usage**:
```promql
# Cache miss rate
rate(cache_misses_total[5m])

# Miss rate by key pattern
sum by (key_pattern) (rate(cache_misses_total[5m]))
```

---

#### `cache_operation_duration_seconds`

**Type**: Histogram

**Description**: Cache operation execution time.

**Buckets**: 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1

**Labels**:
- `operation`: Cache operation (get, set, del, exists)

**Usage**:
```promql
# P95 cache operation time
histogram_quantile(0.95, rate(cache_operation_duration_seconds_bucket[5m]))
```

**Alert Threshold**: P95 > 10ms (indicates Redis performance issue)

---

### System Metrics

#### `process_cpu_usage_percentage`

**Type**: Gauge

**Description**: CPU usage percentage (0-100).

**Usage**:
```promql
# Current CPU usage
process_cpu_usage_percentage

# Average CPU usage
avg(process_cpu_usage_percentage)
```

**Alert Threshold**: > 80% for 5 minutes

---

#### `nodejs_heap_size_used_bytes`

**Type**: Gauge

**Description**: Node.js heap memory used in bytes.

**Usage**:
```promql
# Current memory usage (MB)
nodejs_heap_size_used_bytes / 1024 / 1024

# Memory usage percentage
(nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes) * 100
```

**Alert Threshold**: > 80% of heap size

---

#### `nodejs_eventloop_lag_seconds`

**Type**: Gauge

**Description**: Event loop lag in seconds (indicates blocking operations).

**Usage**:
```promql
# Current event loop lag (ms)
nodejs_eventloop_lag_seconds * 1000
```

**Alert Threshold**: > 100ms

---

## Dashboards

### 1. System Overview Dashboard

**Access**: http://localhost:3001/d/overview

**Panels**:

**Row 1: Golden Signals**
- Request Rate (requests/sec)
- Error Rate (%)
- P95 Latency (ms)
- Saturation (CPU %, Memory %)

**Row 2: Notifications**
- Notifications Created (by channel)
- Notification Status (pie chart)
- Failed Notifications (by reason)
- Delivery Time (P95)

**Row 3: Infrastructure**
- Kafka Consumer Lag
- Database Connections
- Cache Hit Rate
- Redis Memory Usage

**Row 4: System Health**
- CPU Usage (%)
- Memory Usage (%)
- Event Loop Lag (ms)
- GC Duration

---

### 2. Application Performance Dashboard

**Access**: http://localhost:3001/d/performance

**Panels**:

**Row 1: Request Performance**
- Request Duration (P50, P95, P99)
- Requests by Endpoint
- Response Status Codes
- Slowest Endpoints (table)

**Row 2: Database Performance**
- Query Duration (P50, P95, P99)
- Queries per Second
- Slow Queries (> 100ms)
- Connection Pool Usage

**Row 3: Cache Performance**
- Cache Hit Rate (%)
- Cache Operations per Second
- Cache Operation Duration
- Cache Memory Usage

**Row 4: Kafka Performance**
- Messages Published per Second
- Messages Consumed per Second
- Consumer Lag by Topic
- Processing Duration

---

### 3. Business Metrics Dashboard

**Access**: http://localhost:3001/d/business

**Panels**:

**Row 1: Notification Volumes**
- Total Notifications (24h)
- Notifications by Channel (pie chart)
- Notifications by Priority (bar chart)
- Hourly Notification Trend (line chart)

**Row 2: Delivery Success**
- Success Rate (%)
- Failed Notifications (24h)
- Retry Rate (%)
- DLQ Messages (count)

**Row 3: User Activity**
- Active Users (24h)
- New Registrations (24h)
- API Calls per User
- Top Users (by notification count)

**Row 4: Revenue Impact (if applicable)**
- Notifications Delivered (billable)
- Cost per Channel
- Revenue per Notification
- Monthly Trend

---

### 4. SLO Dashboard

**Access**: http://localhost:3001/d/slo

**Service Level Objectives**:

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Availability | 99.9% | 99.95% | ✅ |
| P95 Latency | < 100ms | 80ms | ✅ |
| P99 Latency | < 500ms | 350ms | ✅ |
| Error Rate | < 1% | 0.3% | ✅ |
| Throughput | 50K req/s | 52K req/s | ✅ |

---

## Alerting Rules

### Alert Configuration

**File**: `monitoring/alert-rules.yml`

**Evaluation Interval**: 15 seconds

**Alert Manager**: Prometheus Alertmanager

**Notification Channels**:
- PagerDuty (P0, P1)
- Slack #alerts (P2, P3)
- Email (all)

---

### Critical Alerts (P0)

#### ServiceDown

**Rule**:
```yaml
alert: ServiceDown
expr: up{job="notification-system"} == 0
for: 1m
severity: critical
```

**Description**: Application is not responding to health checks.

**Impact**: All users affected. No notifications can be sent.

**Runbook**:
1. Check pod status: `kubectl get pods -n notification-system`
2. Check logs: `kubectl logs -l app=notification-app`
3. Restart if needed: `kubectl rollout restart deployment/notification-app`

---

#### DatabaseDown

**Rule**:
```yaml
alert: DatabaseDown
expr: pg_up == 0
for: 1m
severity: critical
```

**Description**: PostgreSQL database is unreachable.

**Impact**: All write operations fail. Read-only mode if replicas available.

**Runbook**:
1. Check database status: `kubectl get pods -l app=postgres`
2. Check database logs: `kubectl logs -l app=postgres`
3. Restore from backup if corrupted

---

#### HighErrorRate

**Rule**:
```yaml
alert: HighErrorRate
expr: |
  (sum(rate(http_requests_total{status_code=~"5.."}[5m])) /
   sum(rate(http_requests_total[5m]))) * 100 > 10
for: 5m
severity: critical
```

**Description**: Error rate > 10% for 5 minutes.

**Impact**: Significant number of requests failing.

**Runbook**:
1. Check error logs: `kubectl logs -l app=notification-app | grep ERROR`
2. Check external services (SendGrid, Twilio)
3. Check database connectivity
4. Consider rollback if recent deployment

---

### High Priority Alerts (P1)

#### HighLatency

**Rule**:
```yaml
alert: HighLatency
expr: |
  histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.1
for: 10m
severity: high
```

**Description**: P95 latency > 100ms for 10 minutes.

**Impact**: Slow response times affecting user experience.

**Runbook**:
1. Check CPU/memory usage
2. Check database query performance
3. Check cache hit rate
4. Scale up if needed

---

#### KafkaConsumerLagHigh

**Rule**:
```yaml
alert: KafkaConsumerLagHigh
expr: kafka_consumer_lag > 1000
for: 5m
severity: high
```

**Description**: Consumer lag > 1000 messages for 5 minutes.

**Impact**: Notification delivery delayed.

**Runbook**:
1. Check consumer health: `kubectl logs -l app=notification-app | grep Kafka`
2. Scale consumers: `kubectl scale deployment notification-app --replicas=5`
3. Check for slow external services

---

### Medium Priority Alerts (P2)

#### CacheHitRateLow

**Rule**:
```yaml
alert: CacheHitRateLow
expr: |
  (rate(cache_hits_total[5m]) /
   (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))) * 100 < 70
for: 15m
severity: medium
```

**Description**: Cache hit rate < 70% for 15 minutes.

**Impact**: Increased database load, slower response times.

**Runbook**:
1. Check Redis status: `docker exec notification-redis redis-cli ping`
2. Warm cache: `curl -X POST /admin/cache/warm`
3. Increase TTL if appropriate

---

#### DatabaseConnectionPoolExhausted

**Rule**:
```yaml
alert: DatabaseConnectionPoolExhausted
expr: (db_connections_active / db_connections_max) * 100 > 80
for: 5m
severity: medium
```

**Description**: > 80% of database connections in use.

**Impact**: New requests may be blocked waiting for connections.

**Runbook**:
1. Check for slow queries
2. Increase connection pool size in DATABASE_URL
3. Scale application horizontally

---

### Low Priority Alerts (P3)

#### HighMemoryUsage

**Rule**:
```yaml
alert: HighMemoryUsage
expr: (nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes) * 100 > 80
for: 30m
severity: low
```

**Description**: Memory usage > 80% for 30 minutes.

**Impact**: May lead to OOM if trend continues.

**Runbook**:
1. Check for memory leaks
2. Review recent code changes
3. Increase memory limit if needed

---

## Log Analysis

### Log Format

**Structure**: JSON (Pino format)

**Fields**:
- `level`: Log level (trace, debug, info, warn, error, fatal)
- `time`: ISO 8601 timestamp
- `correlationId`: Unique request identifier
- `userId`: User ID (if authenticated)
- `msg`: Log message
- `...context`: Additional context

**Example**:
```json
{
  "level": "info",
  "time": "2025-12-07T10:00:00.000Z",
  "correlationId": "abc-123",
  "userId": "user-456",
  "msg": "Notification created",
  "notification": {
    "id": "notif-789",
    "channel": "EMAIL",
    "priority": "HIGH"
  }
}
```

---

### Common Log Queries

**View recent errors**:
```bash
kubectl logs -l app=notification-app -n notification-system | grep '"level":"error"' | jq
```

**Track request by correlation ID**:
```bash
kubectl logs -l app=notification-app -n notification-system | grep 'abc-123' | jq
```

**Find slow database queries**:
```bash
kubectl logs -l app=notification-app -n notification-system | grep 'db_query' | grep -v 'duration":[0-9]\.' | jq
```

**Count errors by type**:
```bash
kubectl logs -l app=notification-app -n notification-system | \
  grep '"level":"error"' | \
  jq -r '.error.type' | \
  sort | uniq -c | sort -rn
```

---

## Distributed Tracing

### Jaeger UI

**Access**: http://localhost:16686

**Features**:
- Search traces by service, operation, tags
- Visualize end-to-end request flow
- Identify performance bottlenecks
- Compare trace timings

---

### Common Trace Queries

**Find slow requests**:
- Service: notification-system
- Operation: POST /notifications
- Min Duration: 1s

**Find failed requests**:
- Service: notification-system
- Tags: error=true

**Trace specific user**:
- Service: notification-system
- Tags: user.id=user-456

---

### Analyzing Traces

**Key Spans to Review**:
1. **HTTP Request**: Total request duration
2. **Database Query**: Time spent in database
3. **Cache Operation**: Time spent in Redis
4. **Kafka Publish**: Time spent publishing to Kafka
5. **External Service Call**: Time spent calling SendGrid/Twilio/Firebase

**Performance Optimization**:
- If database span is slow: Add indexes or optimize query
- If cache span is slow: Check Redis performance
- If external service span is slow: Implement timeout or retry logic

---

## Health Checks

### Liveness Probe

**Endpoint**: `GET /health/liveness`

**Purpose**: Is the application running?

**Response**:
```json
{
  "status": "ok"
}
```

**Kubernetes Configuration**:
```yaml
livenessProbe:
  httpGet:
    path: /health/liveness
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
```

---

### Readiness Probe

**Endpoint**: `GET /health/readiness`

**Purpose**: Is the application ready to serve traffic?

**Checks**:
- Database connectivity
- Redis connectivity
- Kafka connectivity

**Response** (healthy):
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "kafka": { "status": "up" }
  }
}
```

**Response** (unhealthy):
```json
{
  "status": "error",
  "error": {
    "database": {
      "status": "down",
      "message": "Connection refused"
    }
  }
}
```

**Kubernetes Configuration**:
```yaml
readinessProbe:
  httpGet:
    path: /health/readiness
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 2
```

---

## Performance Baselines

### Expected Performance

| Metric | Baseline | Target | Limit |
|--------|----------|--------|-------|
| P50 Latency | 15ms | < 20ms | < 50ms |
| P95 Latency | 80ms | < 100ms | < 200ms |
| P99 Latency | 350ms | < 500ms | < 1s |
| Throughput | 52K req/s | 50K req/s | - |
| Error Rate | 0.3% | < 1% | < 5% |
| Cache Hit Rate | 85% | > 80% | > 70% |
| CPU Usage | 40% | < 70% | < 90% |
| Memory Usage | 60% | < 80% | < 90% |

---

### Load Test Results

**Scenario**: Load Test (10K VU for 30 minutes)

**Results**:
- Total Requests: 90M
- Success Rate: 99.7%
- P95 Latency: 85ms
- P99 Latency: 340ms
- Throughput: 50K req/s

**Conclusion**: System meets performance targets ✅

---

## Troubleshooting Guide

### Issue: High Latency

**Symptoms**:
- P95 latency > 100ms
- Slow response times
- User complaints

**Diagnosis**:
```bash
# Check current latency
curl http://localhost:3000/metrics | grep http_request_duration_seconds

# Check database query performance
curl http://localhost:3000/metrics | grep db_query_duration_seconds

# Check cache hit rate
curl http://localhost:3000/metrics | grep -E "cache_hits_total|cache_misses_total"
```

**Solutions**:
1. Check for slow database queries → Add indexes
2. Check cache hit rate → Warm cache or increase TTL
3. Check CPU/memory usage → Scale up
4. Check external services → Implement timeouts

---

### Issue: High Error Rate

**Symptoms**:
- Error rate > 5%
- 500 status codes in logs

**Diagnosis**:
```bash
# Check error logs
kubectl logs -l app=notification-app -n notification-system | grep '"level":"error"'

# Check external service status
curl https://status.sendgrid.com
curl https://status.twilio.com
```

**Solutions**:
1. Check database connectivity
2. Check external service status
3. Check Kafka connectivity
4. Review recent deployments → Rollback if needed

---

### Issue: High Consumer Lag

**Symptoms**:
- Consumer lag > 1000
- Delayed notifications

**Diagnosis**:
```bash
# Check consumer lag
curl http://localhost:3000/admin/queue/stats -H "Authorization: Bearer $ADMIN_TOKEN"

# Check consumer logs
kubectl logs -l app=notification-app -n notification-system | grep Kafka
```

**Solutions**:
1. Scale consumers: `kubectl scale deployment notification-app --replicas=5`
2. Increase partitions: `kafka-topics --alter --partitions 20`
3. Check for slow external service calls
