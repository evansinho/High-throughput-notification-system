# Operational Runbook

Complete operational procedures for the Notification System.

---

## Document Information

- **Version**: 1.0.0
- **Last Updated**: December 7, 2025
- **Maintained By**: Platform Engineering Team
- **On-Call Contact**: +1-555-ONCALL

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Startup Procedures](#startup-procedures)
3. [Shutdown Procedures](#shutdown-procedures)
4. [Failover Procedures](#failover-procedures)
5. [Scaling Operations](#scaling-operations)
6. [Backup & Restore](#backup--restore)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Incident Response](#incident-response)
9. [Maintenance Windows](#maintenance-windows)
10. [Emergency Contacts](#emergency-contacts)

---

## Quick Reference

### Service Status

```bash
# Docker
docker-compose ps
docker-compose logs -f

# Kubernetes
kubectl get pods -n notification-system
kubectl logs -f -l app=notification-app -n notification-system
```

### Health Checks

```bash
# Application health
curl http://localhost:3000/health | jq

# Database health
docker exec notification-postgres pg_isready

# Redis health
docker exec notification-redis redis-cli ping

# Kafka health
docker exec notification-kafka kafka-topics --list --bootstrap-server localhost:9092
```

### Key Metrics

```bash
# Application metrics
curl http://localhost:3000/metrics

# Queue metrics
curl http://localhost:3000/admin/queue/stats -H "Authorization: Bearer $ADMIN_TOKEN"

# System metrics
docker stats
```

---

## Startup Procedures

### 1. Development Environment Startup

**Duration**: 2-3 minutes

**Prerequisites**:
- Docker Desktop running
- Node.js 18+ installed
- `.env` file configured

**Steps**:

```bash
# 1. Clone and setup (first time only)
git clone <repo-url>
cd notification-system
npm install
cp .env.example .env
# Edit .env and set JWT_SECRET

# 2. Start all services
npm run dev

# What this does:
# - Starts Docker containers (PostgreSQL, Redis, Kafka, Zookeeper, Kafka UI)
# - Waits for services to be healthy
# - Runs database migrations
# - Starts NestJS application in watch mode

# 3. Verify services are running
docker-compose ps

# Expected output:
# notification-postgres   Up (healthy)
# notification-redis      Up (healthy)
# notification-kafka      Up
# zookeeper               Up

# 4. Verify application is running
curl http://localhost:3000/health

# Expected output:
# {
#   "status": "ok",
#   "info": {
#     "database": { "status": "up" },
#     "redis": { "status": "up" },
#     "kafka": { "status": "up" }
#   }
# }

# 5. Access services
# Application: http://localhost:3000
# Kafka UI: http://localhost:8080
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/admin)
# Jaeger: http://localhost:16686
```

**Troubleshooting**:

```bash
# If services fail to start
docker-compose down -v  # Remove volumes
docker-compose up -d    # Restart

# If port conflicts
lsof -ti:3000 | xargs kill -9  # Kill process on port 3000

# If database migrations fail
npm run prisma:migrate reset  # Reset database (⚠️ deletes data)
npm run prisma:seed          # Reseed database
```

---

### 2. Production Environment Startup

**Duration**: 5-10 minutes

**Prerequisites**:
- Kubernetes cluster access
- `kubectl` configured
- Docker images pushed to registry
- Secrets configured

**Steps**:

```bash
# 1. Verify cluster access
kubectl cluster-info
kubectl get nodes

# 2. Create namespace (first time only)
kubectl apply -f k8s/namespace.yaml

# 3. Create secrets (first time only)
kubectl apply -f k8s/secrets.yaml

# 4. Create configmap
kubectl apply -f k8s/configmap.yaml

# 5. Deploy database (if not using managed service)
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/postgres-service.yaml

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n notification-system --timeout=300s

# 6. Run database migrations
kubectl run migration \
  --image=notification-system:latest \
  --restart=Never \
  --namespace=notification-system \
  --env="DATABASE_URL=$DATABASE_URL" \
  -- npm run prisma:migrate deploy

# Wait for migration to complete
kubectl wait --for=condition=complete job/migration -n notification-system --timeout=300s

# 7. Deploy Redis
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/redis-service.yaml

# 8. Deploy Kafka (or use managed service)
kubectl apply -f k8s/kafka-deployment.yaml
kubectl apply -f k8s/kafka-service.yaml

# Wait for Kafka to be ready (may take 1-2 minutes)
kubectl wait --for=condition=ready pod -l app=kafka -n notification-system --timeout=300s

# 9. Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=notification-app -n notification-system --timeout=300s

# 10. Enable autoscaling
kubectl apply -f k8s/hpa.yaml

# 11. Verify deployment
kubectl get pods -n notification-system
kubectl get svc -n notification-system
kubectl get ing -n notification-system

# Expected output:
# NAME                               READY   STATUS    RESTARTS   AGE
# notification-app-7d9c8f5b4-abcde   1/1     Running   0          2m
# notification-app-7d9c8f5b4-fghij   1/1     Running   0          2m
# notification-app-7d9c8f5b4-klmno   1/1     Running   0          2m

# 12. Test application health
kubectl port-forward svc/notification-service 3000:80 -n notification-system &
curl http://localhost:3000/health

# 13. Check logs for errors
kubectl logs -l app=notification-app -n notification-system --tail=50

# 14. Monitor metrics
kubectl port-forward svc/notification-service 3000:80 -n notification-system &
curl http://localhost:3000/metrics | grep -E "http_requests_total|notifications_total"
```

**Post-Deployment Checklist**:

- [ ] All pods are Running
- [ ] Health check returns 200 OK
- [ ] Database migrations applied successfully
- [ ] Kafka topics created
- [ ] Redis is accessible
- [ ] Metrics endpoint is accessible
- [ ] Logs show no errors
- [ ] Ingress is routing traffic correctly
- [ ] SSL certificate is valid
- [ ] Monitoring dashboards show data

---

## Shutdown Procedures

### 1. Graceful Shutdown (Planned Maintenance)

**Duration**: 5-10 minutes

**Use Case**: Planned maintenance, deployments, upgrades

**Steps**:

```bash
# 1. Announce maintenance window
# - Post in Slack #notifications
# - Update status page
# - Send email to stakeholders

# 2. Stop accepting new traffic
# Kubernetes: Scale ingress to 0
kubectl scale ingress notification-ingress --replicas=0 -n notification-system

# Docker: Stop nginx/load balancer
docker stop notification-nginx

# 3. Wait for in-flight requests to complete (30 seconds)
sleep 30

# 4. Check Kafka consumer lag
kubectl exec -n notification-system deployment/notification-app -- \
  curl http://localhost:3000/admin/queue/stats

# Wait until lag is < 100 messages (or acceptable threshold)

# 5. Stop Kafka consumers gracefully
# Kubernetes: Set ENABLE_KAFKA_CONSUMER=false
kubectl set env deployment/notification-app ENABLE_KAFKA_CONSUMER=false -n notification-system

# Wait for consumers to stop (check logs)
kubectl logs -f -l app=notification-app -n notification-system | grep "Kafka consumer stopped"

# 6. Stop application
# Kubernetes
kubectl scale deployment notification-app --replicas=0 -n notification-system

# Docker
docker-compose stop app

# 7. Stop supporting services (if needed)
# Kubernetes
kubectl scale deployment notification-redis --replicas=0 -n notification-system
kubectl scale deployment notification-kafka --replicas=0 -n notification-system

# Docker
docker-compose stop redis kafka

# 8. Backup database (recommended)
npm run db:backup

# 9. Stop database (if needed)
# Kubernetes
kubectl scale statefulset notification-postgres --replicas=0 -n notification-system

# Docker
docker-compose stop postgres

# 10. Verify all services are stopped
# Kubernetes
kubectl get pods -n notification-system

# Docker
docker-compose ps

# Expected: All containers stopped or 0 replicas
```

---

### 2. Emergency Shutdown

**Duration**: 1-2 minutes

**Use Case**: Critical security incident, data corruption, service abuse

**Steps**:

```bash
# 1. Immediate stop (no graceful shutdown)
# Kubernetes
kubectl delete deployment notification-app -n notification-system

# Docker
docker-compose down

# 2. Block all traffic at load balancer
# Update firewall rules to block port 3000

# 3. Notify team immediately
# Post in Slack #incidents
# Page on-call engineer

# 4. Preserve logs for investigation
kubectl logs -l app=notification-app -n notification-system --tail=1000 > emergency-logs.txt

# 5. Snapshot database for forensics
npm run db:backup

# 6. Update status page
# "Service unavailable due to emergency maintenance"
```

---

## Failover Procedures

### 1. Application Instance Failure

**Scenario**: One or more application pods crash or become unhealthy.

**Automatic Recovery**: Kubernetes automatically restarts failed pods.

**Manual Intervention** (if auto-recovery fails):

```bash
# 1. Check pod status
kubectl get pods -n notification-system

# 2. Check logs for crash reason
kubectl logs notification-app-7d9c8f5b4-abcde -n notification-system --tail=100

# 3. Check events
kubectl describe pod notification-app-7d9c8f5b4-abcde -n notification-system

# 4. If pod is in CrashLoopBackOff
# Delete pod to force recreation
kubectl delete pod notification-app-7d9c8f5b4-abcde -n notification-system

# 5. If issue persists, rollback deployment
kubectl rollout undo deployment/notification-app -n notification-system

# 6. Monitor for stability
kubectl logs -f -l app=notification-app -n notification-system
```

---

### 2. Database Failure

**Scenario**: PostgreSQL becomes unavailable or corrupted.

**Automatic Recovery**:
- Kubernetes restarts pod if crash
- Read replicas serve read traffic

**Manual Intervention**:

```bash
# 1. Check database status
kubectl exec -n notification-system deployment/notification-app -- \
  curl http://localhost:3000/health

# Expected: database status "down"

# 2. Check database logs
kubectl logs -l app=postgres -n notification-system

# 3. Check for corrupted data
kubectl exec -it postgres-0 -n notification-system -- \
  psql -U notification_user -d notification_db -c "SELECT 1"

# 4. If database is corrupted, restore from backup
npm run db:restore backups/notification_db_20251207_120000.sql.gz

# 5. Restart application to reconnect
kubectl rollout restart deployment/notification-app -n notification-system

# 6. Verify recovery
curl http://localhost:3000/health
```

---

### 3. Redis Failure

**Scenario**: Redis cache becomes unavailable.

**Impact**: Higher database load, slower response times (but service continues).

**Automatic Recovery**: Application degrades gracefully (cache misses go to database).

**Manual Intervention**:

```bash
# 1. Check Redis status
docker exec notification-redis redis-cli ping

# Expected: PONG

# 2. If Redis is down, restart
# Docker
docker-compose restart redis

# Kubernetes
kubectl rollout restart deployment/notification-redis -n notification-system

# 3. Verify reconnection
kubectl logs -l app=notification-app -n notification-system | grep "Redis connected"

# 4. Warm cache to reduce database load
curl -X POST http://localhost:3000/admin/cache/warm \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 5. Monitor database load
curl http://localhost:3000/metrics | grep db_connections_active
```

---

### 4. Kafka Failure

**Scenario**: Kafka broker becomes unavailable.

**Impact**: New notifications cannot be queued (API returns 503).

**Automatic Recovery**: Kafka cluster elects new leader (if using replication).

**Manual Intervention**:

```bash
# 1. Check Kafka status
docker exec notification-kafka kafka-topics --list --bootstrap-server localhost:9092

# 2. Check broker logs
docker logs notification-kafka

# 3. Restart Kafka
# Docker
docker-compose restart kafka

# Kubernetes
kubectl rollout restart deployment/notification-kafka -n notification-system

# 4. Wait for Kafka to be ready (30 seconds)
sleep 30

# 5. Verify topics exist
docker exec notification-kafka kafka-topics --list --bootstrap-server localhost:9092

# Expected: notifications, notifications.retry, notifications.dlq

# 6. Restart application to reconnect
kubectl rollout restart deployment/notification-app -n notification-system

# 7. Check consumer lag (should catch up quickly)
curl http://localhost:3000/admin/queue/stats -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### 5. Total Cluster Failure

**Scenario**: Entire Kubernetes cluster is down.

**Recovery**:

```bash
# 1. Switch DNS to backup cluster
# Update Route53/CloudFlare to point to backup region

# 2. Start services in backup cluster
kubectl config use-context backup-cluster
kubectl apply -f k8s/ -R

# 3. Restore database from latest backup
npm run db:restore backups/notification_db_latest.sql.gz

# 4. Verify services are running
kubectl get pods -n notification-system

# 5. Test application health
curl http://backup-cluster.example.com/health

# 6. Update status page
# "Service restored on backup infrastructure"

# 7. Monitor for stability
# Check Grafana dashboards
# Review logs for errors
```

---

## Scaling Operations

### 1. Scale Up (Increase Capacity)

**When to scale**:
- CPU usage > 70% for 5 minutes
- Memory usage > 80%
- Kafka consumer lag > 1000
- Response time P95 > 100ms

**Horizontal Scaling** (preferred):

```bash
# Kubernetes (manual)
kubectl scale deployment notification-app --replicas=5 -n notification-system

# Kubernetes (automatic - already configured via HPA)
# HPA automatically scales from 3 to 10 replicas based on CPU/memory

# Docker Compose
docker-compose up -d --scale app=5

# Verify scaling
kubectl get pods -n notification-system
# Expected: 5 pods running
```

**Vertical Scaling**:

```bash
# Increase CPU/memory limits
kubectl set resources deployment notification-app \
  --limits=cpu=2000m,memory=1024Mi \
  --requests=cpu=500m,memory=512Mi \
  -n notification-system

# Restart pods to apply changes
kubectl rollout restart deployment/notification-app -n notification-system
```

**Kafka Consumer Scaling**:

```bash
# Increase partitions (must do before scaling consumers)
docker exec notification-kafka kafka-topics \
  --alter --topic notifications \
  --partitions 20 \
  --bootstrap-server localhost:9092

# Scale consumers to match partitions
kubectl scale deployment notification-app --replicas=20 -n notification-system
```

---

### 2. Scale Down (Reduce Capacity)

**When to scale down**:
- CPU usage < 30% for 30 minutes
- Memory usage < 50%
- Low traffic period (e.g., nights, weekends)

**Steps**:

```bash
# Kubernetes
kubectl scale deployment notification-app --replicas=3 -n notification-system

# Wait for pods to drain gracefully (30 seconds)
kubectl get pods -n notification-system -w

# Verify no impact on metrics
curl http://localhost:3000/metrics | grep http_requests_total
```

---

## Backup & Restore

### 1. Automated Backups

**Schedule**: Daily at 2 AM UTC (via cron job)

**Retention**: 7 days (rolling)

**Location**: `./backups/` directory

**Configuration**:

```bash
# Cron job (already configured)
0 2 * * * cd /app && npm run db:backup

# Manual trigger
npm run db:backup

# Output
# Creating backup: backups/notification_db_20251207_020000.sql.gz
# Backup completed successfully (15.2 MB)
# Cleaning up old backups (keeping last 7)
```

---

### 2. Manual Backup

**Before**:
- Deployments
- Schema changes
- Data migrations
- Maintenance windows

**Steps**:

```bash
# 1. Create backup
npm run db:backup

# 2. Verify backup file
ls -lh backups/

# Expected: notification_db_YYYYMMDD_HHMMSS.sql.gz

# 3. Test backup integrity
gunzip -t backups/notification_db_20251207_120000.sql.gz

# Expected: No errors

# 4. Upload to cloud storage (production)
aws s3 cp backups/notification_db_20251207_120000.sql.gz \
  s3://notification-backups/$(date +%Y-%m-%d)/
```

---

### 3. Restore from Backup

**⚠️ WARNING**: This will delete all existing data!

**Steps**:

```bash
# 1. Stop application to prevent writes
kubectl scale deployment notification-app --replicas=0 -n notification-system

# 2. List available backups
ls -lh backups/

# 3. Restore from backup
npm run db:restore backups/notification_db_20251207_120000.sql.gz

# Script will:
# - Stop application
# - Drop existing database
# - Restore from backup
# - Verify restoration

# 4. Run migrations (if restoring old backup)
npm run prisma:migrate deploy

# 5. Start application
kubectl scale deployment notification-app --replicas=3 -n notification-system

# 6. Verify data
curl http://localhost:3000/users | jq

# 7. Check logs
kubectl logs -l app=notification-app -n notification-system --tail=50
```

---

## Monitoring & Alerting

See [MONITORING_GUIDE.md](./MONITORING_GUIDE.md) for detailed monitoring documentation.

### Key Metrics to Monitor

**Golden Signals**:
1. **Latency**: `http_request_duration_seconds_bucket`
2. **Traffic**: `http_requests_total`
3. **Errors**: `http_request_errors_total`
4. **Saturation**: `nodejs_heap_size_used_bytes`, `process_cpu_usage_percentage`

**Business Metrics**:
- `notifications_total{channel,status}`
- `notifications_failed_total{reason}`
- `kafka_consumer_lag`

**Access Dashboards**:
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686

---

## Incident Response

See [INCIDENT_RESPONSE_PLAYBOOK.md](./INCIDENT_RESPONSE_PLAYBOOK.md) for detailed playbook.

### Incident Severity Levels

**P0 - Critical** (Total outage):
- All users affected
- Revenue impact
- Response time: < 15 minutes
- Example: Database down, Kubernetes cluster failure

**P1 - High** (Major degradation):
- Most users affected
- Partial revenue impact
- Response time: < 1 hour
- Example: High error rate, Kafka down

**P2 - Medium** (Minor degradation):
- Some users affected
- No revenue impact
- Response time: < 4 hours
- Example: Single pod crashes, cache down

**P3 - Low** (No immediate impact):
- No users affected
- Response time: < 1 business day
- Example: Monitoring alert, low disk space

### Incident Response Steps

1. **Acknowledge**: Confirm you're responding
2. **Assess**: Determine severity and impact
3. **Communicate**: Post in #incidents, update status page
4. **Mitigate**: Take action to restore service
5. **Document**: Log all actions taken
6. **Resolve**: Verify service is restored
7. **Post-Mortem**: Write incident report within 48 hours

---

## Maintenance Windows

### Scheduled Maintenance

**Frequency**: Monthly (first Sunday of the month, 2-4 AM UTC)

**Duration**: 2 hours

**Notification**: 7 days advance notice

**Typical Activities**:
- Database maintenance (VACUUM, ANALYZE)
- Dependency updates
- Security patches
- Infrastructure upgrades

**Procedure**:

```bash
# 1. Announce maintenance window (7 days before)
# - Post in Slack #notifications
# - Update status page
# - Send email to stakeholders

# 2. Create database backup (1 day before)
npm run db:backup

# 3. Start maintenance window
# Update status page: "Scheduled maintenance in progress"

# 4. Enable maintenance mode (optional)
kubectl set env deployment/notification-app MAINTENANCE_MODE=true -n notification-system

# 5. Perform maintenance tasks
# - Apply database migrations
# - Update dependencies
# - Deploy new version
# - Run database VACUUM/ANALYZE

# 6. Verify services
curl http://localhost:3000/health

# 7. Disable maintenance mode
kubectl set env deployment/notification-app MAINTENANCE_MODE=false -n notification-system

# 8. Monitor for issues (30 minutes)
# Check Grafana dashboards
# Review error logs

# 9. Update status page
# "Maintenance complete. All systems operational."

# 10. Post summary in Slack
# - Duration: 1.5 hours
# - Activities: Database migration, dependency updates
# - Impact: None
# - Issues: None
```

---

## Emergency Contacts

### On-Call Rotation

| Week | Primary | Secondary |
|------|---------|-----------|
| Week 1 | Alice (+1-555-1111) | Bob (+1-555-2222) |
| Week 2 | Bob (+1-555-2222) | Charlie (+1-555-3333) |
| Week 3 | Charlie (+1-555-3333) | Alice (+1-555-1111) |
| Week 4 | Alice (+1-555-1111) | Bob (+1-555-2222) |

### Escalation Path

1. **On-Call Engineer** (+1-555-ONCALL): First responder
2. **Engineering Manager** (+1-555-MANAGER): If unresolved after 30 minutes
3. **VP Engineering** (+1-555-VP-ENG): If P0 incident
4. **CTO** (+1-555-CTO): If business-critical

### External Contacts

- **AWS Support**: 1-877-AWS-SUPPORT (P0/P1 incidents)
- **SendGrid Support**: support@sendgrid.com
- **Twilio Support**: help@twilio.com
- **Database DBA**: dba@example.com

### Communication Channels

- **Slack**: #incidents (for all incidents)
- **PagerDuty**: For alerting on-call engineer
- **Status Page**: status.example.com (for customer updates)
- **Zoom**: Incident bridge for P0/P1 incidents

---

## Appendix

### Common Commands Reference

```bash
# Docker Compose
docker-compose up -d        # Start services
docker-compose down         # Stop services
docker-compose ps           # Check status
docker-compose logs -f app  # Follow logs
docker-compose restart app  # Restart service

# Kubernetes
kubectl get pods -n notification-system           # List pods
kubectl logs -f pod-name -n notification-system   # Follow logs
kubectl describe pod pod-name -n notification-system  # Pod details
kubectl exec -it pod-name -n notification-system -- bash  # Shell into pod
kubectl port-forward svc/notification-service 3000:80 -n notification-system  # Port forward

# Database
npm run db:backup           # Backup database
npm run db:restore <file>   # Restore database
npm run prisma:migrate      # Run migrations
npm run prisma:studio       # Open Prisma Studio

# Application
npm run dev                 # Start in dev mode
npm run build               # Build for production
npm run start:prod          # Start in prod mode
npm test                    # Run tests
```
