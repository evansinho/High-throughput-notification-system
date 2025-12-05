# Alert Runbooks

This document provides step-by-step troubleshooting guides for all Prometheus alerts.

## Table of Contents

- [P0 - Critical Alerts](#p0---critical-alerts)
  - [HighNotificationFailureRate](#highnotificationfailurerate)
  - [ServiceDown](#servicedown)
  - [HighErrorRate](#higherrorrate)
- [P1 - High Alerts](#p1---high-alerts)
  - [HighKafkaConsumerLag](#highkafkaconsumerlag)
  - [HighP95Latency](#highp95latency)
  - [DatabaseConnectionPoolExhausted](#databaseconnectionpoolexhausted)
- [P2 - Medium Alerts](#p2---medium-alerts)
  - [ElevatedNotificationFailureRate](#elevatednotificationfailurerate)
  - [LowCacheHitRate](#lowcachehitrate)
  - [HighDatabaseQueryLatency](#highdatabasequerylatency)
- [P3 - Low Alerts](#p3---low-alerts)
  - [ModerateTrafficIncrease](#moderatetrafficincrease)
  - [KafkaPublishErrors](#kafkapublisherrors)
  - [DatabaseQueryErrors](#databasequeryerrors)

---

## P0 - Critical Alerts

### HighNotificationFailureRate

**Severity:** P0 - Critical
**Threshold:** > 5% failure rate for 2 minutes

#### What It Means
More than 5% of notifications are failing to be delivered or processed.

#### Impact
- Users not receiving important notifications
- Potential data loss
- Business SLAs at risk

#### Investigation Steps

1. **Check Grafana Dashboard**
   ```
   Navigate to: http://localhost:3001
   Dashboard: Notification System Overview
   Panel: Notification Failure Rate by Channel
   ```

2. **Query Prometheus for Details**
   ```promql
   # Check failure rate by channel
   rate(notifications_failed_total[5m]) / rate(notifications_total[5m])

   # Check error reasons
   topk(5, sum by (error_reason) (rate(notifications_failed_total[5m])))
   ```

3. **Check Application Logs**
   ```bash
   # Search for recent errors
   docker logs notification-api 2>&1 | grep -i "error\|fail" | tail -50

   # Check for correlation IDs
   docker logs notification-api 2>&1 | grep -i "correlationId" | tail -20
   ```

4. **Check External Service Status**
   - SendGrid (email): https://status.sendgrid.com
   - Twilio (SMS): https://status.twilio.com
   - Firebase (push): https://status.firebase.google.com

5. **Check Kafka Consumer Status**
   ```bash
   # Check consumer lag
   docker exec -it notification-kafka kafka-consumer-groups \
     --bootstrap-server localhost:9092 \
     --describe --group notification-workers
   ```

#### Resolution Steps

1. **If External Service is Down:**
   - Notifications will automatically fall back to mock service
   - Monitor for service recovery
   - Consider manual retry after service recovery

2. **If Kafka Consumer is Lagging:**
   - Scale up consumer instances
   - Check for slow message processing
   - Investigate database connection issues

3. **If Application Error:**
   - Check database connectivity
   - Verify Redis connectivity
   - Check for configuration issues
   - Review recent deployments

4. **Immediate Mitigation:**
   ```bash
   # Restart the application
   docker-compose restart app

   # Scale up if needed
   docker-compose up --scale app=3
   ```

#### Post-Incident
- Review error logs for root cause
- Update error handling if needed
- Document lessons learned
- Update monitoring thresholds if necessary

---

### ServiceDown

**Severity:** P0 - Critical
**Threshold:** Service unreachable for 1 minute

#### What It Means
The notification system is completely down and not responding to health checks.

#### Impact
- Complete service outage
- No notifications being processed
- All API requests failing

#### Investigation Steps

1. **Check Service Status**
   ```bash
   # Check if container is running
   docker ps | grep notification

   # Check container logs
   docker logs notification-api --tail=100

   # Check health endpoint
   curl http://localhost:3000/health
   ```

2. **Check System Resources**
   ```bash
   # Check disk space
   df -h

   # Check memory
   free -h

   # Check Docker resources
   docker stats --no-stream
   ```

3. **Check Dependencies**
   ```bash
   # Check PostgreSQL
   docker exec notification-postgres pg_isready

   # Check Redis
   docker exec notification-redis redis-cli ping

   # Check Kafka
   docker exec notification-kafka kafka-broker-api-versions \
     --bootstrap-server localhost:9092
   ```

#### Resolution Steps

1. **Restart the Service**
   ```bash
   docker-compose restart app
   ```

2. **If Restart Fails, Check Logs**
   ```bash
   docker-compose logs app --tail=200
   ```

3. **Rebuild and Restart**
   ```bash
   docker-compose down
   docker-compose build app
   docker-compose up -d
   ```

4. **If Dependencies are Down**
   ```bash
   # Restart all services
   docker-compose down
   docker-compose up -d
   ```

#### Post-Incident
- Review deployment process
- Add pre-deployment health checks
- Consider adding redundancy
- Review monitoring and alerting

---

### HighErrorRate

**Severity:** P0 - Critical
**Threshold:** > 10% HTTP error rate for 2 minutes

#### What It Means
More than 10% of HTTP requests are returning 4xx or 5xx errors.

#### Impact
- Poor user experience
- API consumers experiencing failures
- Potential cascading failures

#### Investigation Steps

1. **Identify Error Types**
   ```promql
   # Check 4xx vs 5xx errors
   sum by (status_code) (rate(http_requests_total{status_code=~"4.."}[5m]))
   sum by (status_code) (rate(http_requests_total{status_code=~"5.."}[5m]))

   # Check which endpoints are failing
   topk(10, sum by (route, status_code) (rate(http_requests_total[5m])))
   ```

2. **Check Application Logs**
   ```bash
   # Recent 5xx errors
   docker logs notification-api 2>&1 | grep "ERROR" | tail -50

   # Recent 4xx errors
   docker logs notification-api 2>&1 | grep "WARN" | tail -50
   ```

3. **Check Database**
   ```bash
   # Check for slow queries
   docker exec notification-postgres psql -U notification_user -d notification_db \
     -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

#### Resolution Steps

1. **If 4xx Errors (Client Errors):**
   - Check for breaking API changes
   - Review authentication/authorization
   - Check request validation

2. **If 5xx Errors (Server Errors):**
   - Check database connectivity
   - Check external service availability
   - Review recent code changes
   - Restart service if necessary

3. **Temporary Mitigation:**
   ```bash
   # Enable circuit breaker
   # Scale up instances
   docker-compose up --scale app=3
   ```

#### Post-Incident
- Review error handling
- Add more specific error monitoring
- Improve API documentation
- Add request validation

---

## P1 - High Alerts

### HighKafkaConsumerLag

**Severity:** P1 - High
**Threshold:** > 1000 messages for 5 minutes

#### What It Means
Kafka consumer is falling behind and not processing messages fast enough.

#### Impact
- Delayed notification delivery
- Increasing message backlog
- Potential system slowdown

#### Investigation Steps

1. **Check Consumer Lag Details**
   ```bash
   docker exec notification-kafka kafka-consumer-groups \
     --bootstrap-server localhost:9092 \
     --describe --group notification-workers
   ```

2. **Check Consumer Performance**
   ```promql
   # Messages consumed per second
   rate(kafka_messages_consumed_total[5m])

   # Compare to published rate
   rate(kafka_messages_published_total[5m])
   ```

3. **Check Message Processing Time**
   ```promql
   histogram_quantile(0.95, rate(notification_processing_duration_seconds_bucket[5m]))
   ```

#### Resolution Steps

1. **Scale Up Consumers**
   ```bash
   # Increase consumer instances
   docker-compose up --scale consumer=3
   ```

2. **Optimize Message Processing**
   - Check for slow database queries
   - Check for slow external API calls
   - Review message processing logic

3. **Increase Partition Count** (if needed)
   ```bash
   docker exec notification-kafka kafka-topics \
     --bootstrap-server localhost:9092 \
     --alter --topic notifications --partitions 10
   ```

#### Post-Incident
- Review consumer performance metrics
- Optimize message processing
- Consider auto-scaling

---

### HighP95Latency

**Severity:** P1 - High
**Threshold:** > 1 second for 5 minutes

#### What It Means
95% of requests are taking longer than 1 second to complete.

#### Impact
- Poor user experience
- Potential timeouts
- Increased resource usage

#### Investigation Steps

1. **Check Latency by Endpoint**
   ```promql
   histogram_quantile(0.95,
     sum by (route) (rate(http_request_duration_seconds_bucket[5m]))
   )
   ```

2. **Check Slow Operations**
   - Database queries
   - Cache operations
   - External API calls
   - Kafka publishing

3. **Review Traces in Jaeger**
   ```
   Navigate to: http://localhost:16686
   Service: notification-system
   Operation: All
   Lookback: Last 1 hour
   Sort by: Duration
   ```

#### Resolution Steps

1. **Optimize Database Queries**
   - Add missing indexes
   - Optimize query patterns
   - Use connection pooling

2. **Improve Caching**
   - Increase cache TTL for stable data
   - Add caching for expensive operations
   - Warm up cache on startup

3. **Scale Resources**
   ```bash
   docker-compose up --scale app=3
   ```

#### Post-Incident
- Review slow endpoints
- Add performance tests
- Optimize hot paths

---

### DatabaseConnectionPoolExhausted

**Severity:** P1 - High
**Threshold:** > 90 active connections for 3 minutes

#### What It Means
Database connection pool is near capacity, may cause connection failures.

#### Impact
- New requests may fail
- Increased latency
- Potential service degradation

#### Investigation Steps

1. **Check Active Connections**
   ```bash
   docker exec notification-postgres psql -U notification_user -d notification_db \
     -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   ```

2. **Identify Long-Running Queries**
   ```bash
   docker exec notification-postgres psql -U notification_user -d notification_db \
     -c "SELECT pid, query_start, state, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"
   ```

#### Resolution Steps

1. **Kill Long-Running Queries** (if necessary)
   ```bash
   docker exec notification-postgres psql -U notification_user -d notification_db \
     -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';"
   ```

2. **Increase Connection Pool Size** (in .env)
   ```
   DATABASE_POOL_SIZE=20
   DATABASE_POOL_TIMEOUT=30000
   ```

3. **Restart Application**
   ```bash
   docker-compose restart app
   ```

#### Post-Incident
- Review connection usage
- Optimize query patterns
- Add connection pool monitoring

---

## P2 - Medium Alerts

### ElevatedNotificationFailureRate

**Severity:** P2 - Medium
**Threshold:** > 2% failure rate for 10 minutes

#### What It Means
Notification failure rate is elevated but not critical.

#### Investigation Steps
Similar to [HighNotificationFailureRate](#highnotificationfailurerate) but less urgent.

#### Resolution Steps
- Monitor the situation
- Check for patterns
- Investigate during business hours

---

### LowCacheHitRate

**Severity:** P2 - Medium
**Threshold:** < 70% hit rate for 15 minutes

#### What It Means
Cache is not being utilized effectively.

#### Impact
- Increased database load
- Higher latency
- Increased costs

#### Investigation Steps

1. **Check Cache Hit Rate**
   ```promql
   rate(cache_hits_total[10m]) / (rate(cache_hits_total[10m]) + rate(cache_misses_total[10m]))
   ```

2. **Check Cache Keys**
   ```bash
   docker exec notification-redis redis-cli --scan --pattern '*' | head -20
   ```

#### Resolution Steps

1. **Increase Cache TTL**
2. **Add More Caching**
3. **Warm Up Cache**

---

### HighDatabaseQueryLatency

**Severity:** P2 - Medium
**Threshold:** > 500ms P95 for 10 minutes

#### What It Means
Database queries are slower than expected.

#### Resolution Steps
- Add indexes
- Optimize queries
- Scale database resources

---

## P3 - Low Alerts

### ModerateTrafficIncrease

**Severity:** P3 - Low
**Threshold:** 50% above normal for 15 minutes

#### What It Means
Traffic is higher than usual but system is handling it.

#### Action
- Monitor the situation
- Prepare to scale if needed

---

### KafkaPublishErrors

**Severity:** P3 - Low
**Threshold:** Any errors for 10 minutes

#### What It Means
Occasional errors publishing to Kafka.

#### Action
- Check Kafka broker health
- Review error patterns

---

### DatabaseQueryErrors

**Severity:** P3 - Low
**Threshold:** > 0.01/s for 10 minutes

#### What It Means
Occasional database errors occurring.

#### Action
- Review error logs
- Check for connection issues
