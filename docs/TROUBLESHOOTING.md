# Troubleshooting Guide

Quick reference for diagnosing and resolving common issues in the Notification System.

---

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Application Issues](#application-issues)
3. [Database Issues](#database-issues)
4. [Kafka Issues](#kafka-issues)
5. [Redis Issues](#redis-issues)
6. [Performance Issues](#performance-issues)
7. [Authentication Issues](#authentication-issues)
8. [Integration Issues](#integration-issues)
9. [Monitoring Issues](#monitoring-issues)
10. [Common Error Messages](#common-error-messages)

---

## Quick Diagnostics

### Health Check Command

```bash
# Check all services
curl http://localhost:3000/health | jq

# Expected output
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "kafka": { "status": "up" }
  }
}
```

### Service Status

```bash
# Check Docker containers
docker-compose ps

# Check Kubernetes pods
kubectl get pods -n notification-system

# Check logs
docker-compose logs app --tail=50
kubectl logs -l app=notification-app -n notification-system --tail=50
```

---

## Application Issues

### Issue: Application Won't Start

**Symptoms**:
- Container crashes immediately
- "Error: Cannot find module" errors
- Port already in use

**Diagnostics**:
```bash
# Check logs
docker logs notification-api

# Check if port is in use
lsof -i :3000
netstat -an | grep 3000

# Check environment variables
docker exec notification-api env | grep DATABASE_URL
```

**Solutions**:

1. **Missing Dependencies**:
```bash
# Rebuild with fresh dependencies
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

2. **Port Conflict**:
```bash
# Kill process using port 3000
kill -9 $(lsof -t -i:3000)

# Or change port in .env
PORT=3001
```

3. **Environment Variables Missing**:
```bash
# Verify .env file exists
ls -la .env

# Check required variables
grep JWT_SECRET .env
grep DATABASE_URL .env
```

### Issue: Application Crashes Randomly

**Symptoms**:
- Container restarts frequently
- Out of memory errors
- Unhandled promise rejections

**Diagnostics**:
```bash
# Check memory usage
docker stats notification-api

# Check error logs
docker logs notification-api 2>&1 | grep -i "error\|fatal"

# Check for unhandled rejections
docker logs notification-api 2>&1 | grep "UnhandledPromiseRejection"
```

**Solutions**:

1. **Memory Issues**:
```yaml
# Increase memory limit in docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 1024M  # Increase from 512M
```

2. **Unhandled Errors**:
```bash
# Add better error handling
# Check src/common/filters/http-exception.filter.ts
# Ensure all promises have .catch() or try/catch
```

---

## Database Issues

### Issue: Cannot Connect to Database

**Symptoms**:
- "ECONNREFUSED" errors
- "password authentication failed"
- Timeout errors

**Diagnostics**:
```bash
# Test database connectivity
docker exec -it notification-postgres psql -U notification_user -d notification_db -c "SELECT 1"

# Check if database is running
docker ps | grep postgres

# Check database logs
docker logs notification-postgres
```

**Solutions**:

1. **Database Not Running**:
```bash
# Start database
docker-compose up -d postgres

# Wait for it to be ready
docker exec notification-postgres pg_isready
```

2. **Wrong Credentials**:
```bash
# Verify DATABASE_URL in .env
echo $DATABASE_URL

# Update if incorrect
DATABASE_URL="postgresql://notification_user:notification_password@localhost:5432/notification_db"
```

3. **Connection Pool Exhausted**:
```bash
# Check active connections
docker exec notification-postgres psql -U notification_user -d notification_db -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Increase pool size in .env
DATABASE_URL="...?connection_limit=20&pool_timeout=30"
```

### Issue: Migration Failures

**Symptoms**:
- "Migration failed" errors
- Schema out of sync
- Prisma client not generated

**Diagnostics**:
```bash
# Check migration status
npm run prisma:migrate status

# Check Prisma logs
cat prisma/schema.prisma
```

**Solutions**:

1. **Resolve Failed Migration**:
```bash
# Mark as rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# Re-apply
npm run prisma:migrate deploy
```

2. **Reset Database** (⚠️ CAUTION: Deletes all data):
```bash
npm run prisma:migrate reset
npm run prisma:seed
```

3. **Generate Prisma Client**:
```bash
npm run prisma:generate
```

---

## Kafka Issues

### Issue: Kafka Not Producing Messages

**Symptoms**:
- Notifications created but not processed
- "Kafka producer error" in logs
- Consumer lag increasing

**Diagnostics**:
```bash
# Check Kafka is running
docker ps | grep kafka

# Check Kafka logs
docker logs notification-kafka

# List topics
docker exec notification-kafka kafka-topics --list --bootstrap-server localhost:9092

# Check messages in topic
docker exec notification-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic notifications \
  --from-beginning \
  --max-messages 10
```

**Solutions**:

1. **Kafka Not Running**:
```bash
# Restart Kafka
docker-compose restart kafka

# Wait for it to be ready (30 seconds)
sleep 30
```

2. **Topic Doesn't Exist**:
```bash
# Create topic
docker exec notification-kafka kafka-topics \
  --create --topic notifications \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

3. **Producer Connection Issues**:
```bash
# Check KAFKA_BROKER in .env
KAFKA_BROKER=localhost:9092

# Test connection
docker exec notification-api nc -zv kafka 9092
```

### Issue: High Consumer Lag

**Symptoms**:
- Notifications delayed
- Consumer lag > 1000 messages
- Processing slow

**Diagnostics**:
```bash
# Check consumer lag
docker exec notification-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --group notification-workers

# Check processing rate
curl http://localhost:3000/metrics | grep kafka_messages_consumed
```

**Solutions**:

1. **Scale Consumers**:
```bash
# Run multiple instances
docker-compose up -d --scale app=3
```

2. **Increase Partitions**:
```bash
docker exec notification-kafka kafka-topics \
  --alter --topic notifications \
  --partitions 10 \
  --bootstrap-server localhost:9092
```

3. **Optimize Processing**:
- Check for slow database queries
- Ensure caching is working
- Profile worker performance

---

## Redis Issues

### Issue: Cannot Connect to Redis

**Symptoms**:
- "ECONNREFUSED" errors
- Cache misses
- Timeout errors

**Diagnostics**:
```bash
# Test Redis connectivity
docker exec notification-redis redis-cli ping

# Check if Redis is running
docker ps | grep redis

# Check Redis logs
docker logs notification-redis
```

**Solutions**:

1. **Redis Not Running**:
```bash
# Start Redis
docker-compose up -d redis

# Test connection
docker exec notification-redis redis-cli ping
# Should return: PONG
```

2. **Wrong Credentials**:
```bash
# Check REDIS_PASSWORD in .env
echo $REDIS_PASSWORD

# Test with password
docker exec notification-redis redis-cli -a $REDIS_PASSWORD ping
```

### Issue: Low Cache Hit Rate

**Symptoms**:
- Cache hit rate < 70%
- High database load
- Slow response times

**Diagnostics**:
```bash
# Check cache stats
docker exec notification-redis redis-cli INFO stats | grep keyspace

# Check cache hit rate
curl http://localhost:3000/metrics | grep cache_hits

# Calculate hit rate
docker exec notification-redis redis-cli INFO stats | \
  awk '/keyspace_hits/ {hits=$2} /keyspace_misses/ {misses=$2} \
  END {print "Hit Rate: " (hits/(hits+misses)*100) "%"}'
```

**Solutions**:

1. **Increase TTL**:
```typescript
// src/common/constants.ts
export const CACHE_TTL = {
  SHORT: 60,
  MEDIUM: 300,
  LONG: 3600,  // Increase from 1800
};
```

2. **Warm Cache**:
```bash
# Implement cache warming in src/jobs/cache-warming.job.ts
# See load-tests/EXECUTION_GUIDE.md for details
```

3. **Add More Caching**:
```typescript
// Cache hot paths
async findById(id: string) {
  return this.cacheService.getOrSet(
    `notification:${id}`,
    () => this.prisma.notification.findUnique({ where: { id } }),
    CACHE_TTL.LONG
  );
}
```

---

## Performance Issues

### Issue: High Latency (P95 > 100ms)

**Symptoms**:
- Slow API responses
- Timeout errors
- High p95/p99 latency

**Diagnostics**:
```bash
# Check metrics
curl http://localhost:3000/metrics | grep http_request_duration

# Check database query performance
docker exec notification-postgres psql -U notification_user -d notification_db -c \
  "SELECT query, mean_exec_time, calls FROM pg_stat_statements \
   ORDER BY mean_exec_time DESC LIMIT 10;"

# Check for N+1 queries
docker logs notification-api 2>&1 | grep "SELECT.*FROM" | sort | uniq -c
```

**Solutions**:

1. **Add Database Indexes**:
```sql
-- Common indexes
CREATE INDEX CONCURRENTLY idx_notifications_user_status
  ON notifications(userId, status, createdAt DESC);

CREATE INDEX CONCURRENTLY idx_notifications_scheduled
  ON notifications(status, scheduledFor)
  WHERE status = 'SCHEDULED';
```

2. **Optimize Queries**:
```typescript
// Use select to fetch only needed fields
const notifications = await prisma.notification.findMany({
  select: { id: true, type: true, status: true },
});

// Use include instead of separate queries
const notifications = await prisma.notification.findMany({
  include: { user: true },  // Join instead of N+1
});
```

3. **Enable Compression**:
```typescript
// Kafka compression already enabled in src/kafka/kafka-producer.service.ts
compression: CompressionTypes.GZIP
```

### Issue: High CPU Usage

**Symptoms**:
- CPU > 80%
- Slow response times
- Container throttling

**Diagnostics**:
```bash
# Check CPU usage
docker stats notification-api

# Profile Node.js
# Add --inspect flag to npm start in docker-compose.yml
# Use Chrome DevTools for profiling
```

**Solutions**:

1. **Enable Clustering**:
```typescript
// src/main.ts - Add clustering
import * as cluster from 'cluster';
import * as os from 'os';

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  // Worker process
  bootstrap();
}
```

2. **Increase CPU Limit**:
```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'  # Increase from 1
```

---

## Authentication Issues

### Issue: JWT Token Invalid

**Symptoms**:
- "Unauthorized" errors
- Token expired messages
- Invalid signature errors

**Diagnostics**:
```bash
# Decode JWT token (without verification)
echo "YOUR_TOKEN" | cut -d'.' -f2 | base64 -d | jq

# Check JWT_SECRET
echo $JWT_SECRET

# Verify token expiration
# Payload should have 'exp' field (Unix timestamp)
```

**Solutions**:

1. **Token Expired**:
```bash
# User needs to login again
# Or implement refresh token flow
```

2. **Wrong Secret**:
```bash
# Ensure JWT_SECRET is same across all instances
# Check .env file
grep JWT_SECRET .env

# Restart application after changing
docker-compose restart app
```

3. **Token Malformed**:
```bash
# Ensure Bearer prefix
Authorization: Bearer <token>

# Not:
Authorization: <token>
```

---

## Integration Issues

### Issue: SendGrid Email Not Sending

**Symptoms**:
- Email notifications marked as FAILED
- "SendGrid API error" in logs

**Diagnostics**:
```bash
# Check SendGrid API key
echo $SENDGRID_API_KEY

# Test SendGrid connection
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"personalizations":[{"to":[{"email":"test@example.com"}]}],"from":{"email":"noreply@example.com"},"subject":"Test","content":[{"type":"text/plain","value":"Test"}]}'
```

**Solutions**:

1. **Invalid API Key**:
```bash
# Get new API key from SendGrid dashboard
# Update .env
SENDGRID_API_KEY=SG.new_key_here
```

2. **Rate Limiting**:
```bash
# Check SendGrid rate limits
# Upgrade plan or reduce email volume
```

3. **Use Mock Service**:
```bash
# For testing
ENABLE_MOCK_SERVICES=true
```

---

## Monitoring Issues

### Issue: Metrics Not Appearing in Prometheus

**Symptoms**:
- Empty graphs in Grafana
- No data in Prometheus

**Diagnostics**:
```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Check Prometheus targets
open http://localhost:9090/targets

# Check Prometheus logs
docker logs notification-prometheus
```

**Solutions**:

1. **Prometheus Not Scraping**:
```yaml
# monitoring/prometheus.yml
scrape_configs:
  - job_name: 'notification-system'
    static_configs:
      - targets: ['host.docker.internal:3000']  # Use correct hostname
    metrics_path: '/metrics'
    scrape_interval: 15s
```

2. **Restart Prometheus**:
```bash
docker-compose restart prometheus
```

---

## Common Error Messages

### "ECONNREFUSED"
- **Cause**: Service not running or wrong host/port
- **Fix**: Check service status and connection string

### "password authentication failed"
- **Cause**: Wrong database credentials
- **Fix**: Verify DATABASE_URL in .env

### "Kafka producer error"
- **Cause**: Kafka not running or unreachable
- **Fix**: Check Kafka status and KAFKA_BROKER

### "Redis connection timeout"
- **Cause**: Redis not running or wrong password
- **Fix**: Check Redis status and REDIS_PASSWORD

### "Migration failed"
- **Cause**: Database schema out of sync
- **Fix**: Run `npx prisma migrate resolve` and re-apply

### "Unauthorized"
- **Cause**: Missing or invalid JWT token
- **Fix**: Login again to get new token

### "Rate limit exceeded"
- **Cause**: Too many requests
- **Fix**: Wait or increase rate limits

---

## Getting Help

### Logs to Collect

When reporting issues, include:

```bash
# Application logs
docker logs notification-api > app.log

# Database logs
docker logs notification-postgres > db.log

# Kafka logs
docker logs notification-kafka > kafka.log

# System info
docker-compose ps > services.txt
docker stats --no-stream > resources.txt

# Metrics
curl http://localhost:3000/metrics > metrics.txt
```

### Support Channels

- **GitHub Issues**: https://github.com/your-org/notification-system/issues
- **Slack**: #notification-system
- **Email**: support@example.com
- **On-Call**: +1-555-ONCALL

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug

# Enable Prisma query logging
DEBUG=prisma:query

# Enable all debug logs
DEBUG=*
```
