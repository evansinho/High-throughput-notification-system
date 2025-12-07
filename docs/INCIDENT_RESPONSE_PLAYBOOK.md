# Incident Response Playbook

Comprehensive incident response procedures for the Notification System.

---

## Document Information

- **Version**: 1.0.0
- **Last Updated**: December 7, 2025
- **Maintained By**: Platform Engineering Team
- **Emergency Contact**: +1-555-ONCALL

---

## Table of Contents

1. [Incident Classification](#incident-classification)
2. [Response Team](#response-team)
3. [Incident Response Process](#incident-response-process)
4. [Communication Protocols](#communication-protocols)
5. [Incident Scenarios](#incident-scenarios)
6. [Post-Incident Review](#post-incident-review)
7. [Tools & Resources](#tools--resources)

---

## Incident Classification

### Severity Levels

#### P0 - Critical (SEV-1)

**Definition**: Complete service outage affecting all users.

**Examples**:
- Application completely down
- Database unreachable
- Kubernetes cluster failure
- Data breach / security incident

**Response Time**: < 15 minutes

**Escalation**: Immediate page to on-call + manager

**Communication**: Update status page immediately, post-mortem required

---

#### P1 - High (SEV-2)

**Definition**: Major functionality degraded affecting most users.

**Examples**:
- Error rate > 50%
- P99 latency > 5 seconds
- Kafka cluster down (notifications not processing)
- Redis cluster down (severe performance degradation)

**Response Time**: < 1 hour

**Escalation**: Page on-call, notify manager after 30 minutes

**Communication**: Update status page, incident channel updates

---

#### P2 - Medium (SEV-3)

**Definition**: Minor functionality degraded affecting some users.

**Examples**:
- Error rate 10-50%
- Single pod crashes repeatedly
- High consumer lag (> 5000 messages)
- Cache hit rate < 50%

**Response Time**: < 4 hours

**Escalation**: On-call handles, no manager escalation unless unresolved

**Communication**: Incident channel updates only

---

#### P3 - Low (SEV-4)

**Definition**: No immediate user impact, potential future issue.

**Examples**:
- Non-critical alert triggered
- Disk space > 80%
- Memory usage trending up
- Single error spike (resolved automatically)

**Response Time**: < 1 business day

**Escalation**: Create ticket, handle during business hours

**Communication**: Internal tracking only

---

## Response Team

### On-Call Rotation

**Primary On-Call**: First responder for all incidents

**Secondary On-Call**: Backup if primary unavailable, assists with P0/P1

**Schedule**: View current on-call: https://pagerduty.com/schedules

---

### Roles & Responsibilities

#### Incident Commander (IC)

**Primary On-Call acts as IC for P0/P1**

**Responsibilities**:
- Declare incident and severity
- Coordinate response efforts
- Make decisions on mitigation strategies
- Communicate with stakeholders
- Facilitate post-mortem

---

#### Technical Lead

**Subject matter expert for affected system**

**Responsibilities**:
- Diagnose root cause
- Implement fixes
- Provide technical guidance
- Document actions taken

---

#### Communications Lead

**For P0/P1 incidents only**

**Responsibilities**:
- Update status page
- Post updates in #incidents Slack channel
- Notify stakeholders via email
- Coordinate with support team

---

#### Support Representative

**For customer-facing incidents**

**Responsibilities**:
- Monitor support tickets
- Respond to customer inquiries
- Escalate critical issues
- Track affected customers

---

## Incident Response Process

### 1. Detection

**How incidents are detected**:
- Automated alerts (PagerDuty, Prometheus)
- User reports (support tickets, social media)
- Monitoring dashboards (Grafana)
- Internal testing

**Upon detection**:
```bash
# Check alert details
# Review Grafana dashboards: http://localhost:3001
# Check application health: curl http://localhost:3000/health
# Review recent deployments: kubectl rollout history deployment/notification-app
```

---

### 2. Acknowledgment

**Within 5 minutes of alert**:

1. **Acknowledge** PagerDuty alert (confirms you're responding)

2. **Post in #incidents**:
```
🚨 INCIDENT DETECTED
Severity: P0/P1/P2/P3
System: Notification System
Impact: [Describe user impact]
Incident Commander: @yourname
Status: Investigating
```

3. **Create incident bridge** (P0/P1 only):
- Start Zoom call: https://zoom.us/j/incident-bridge
- Post link in #incidents channel

---

### 3. Assessment

**Determine severity and impact**:

```bash
# Check error rate
curl http://localhost:3000/metrics | grep http_request_errors_total

# Check latency
curl http://localhost:3000/metrics | grep http_request_duration_seconds

# Check service health
kubectl get pods -n notification-system
curl http://localhost:3000/health | jq

# Check recent logs
kubectl logs -l app=notification-app -n notification-system --tail=100 | grep ERROR

# Check recent changes
git log --oneline --since="2 hours ago"
kubectl rollout history deployment/notification-app -n notification-system
```

**Answer these questions**:
- How many users are affected?
- What functionality is impacted?
- Is data at risk?
- What changed recently?

**Classify severity** using criteria above.

---

### 4. Mitigation

**Goal**: Restore service as quickly as possible (may not fix root cause).

**Common Mitigation Strategies**:

#### Rollback Deployment

```bash
# View deployment history
kubectl rollout history deployment/notification-app -n notification-system

# Rollback to previous version
kubectl rollout undo deployment/notification-app -n notification-system

# Rollback to specific revision
kubectl rollout undo deployment/notification-app --to-revision=5 -n notification-system

# Verify rollback
kubectl rollout status deployment/notification-app -n notification-system
```

#### Scale Up Resources

```bash
# Scale application pods
kubectl scale deployment notification-app --replicas=10 -n notification-system

# Increase resource limits
kubectl set resources deployment notification-app \
  --limits=cpu=2000m,memory=2048Mi -n notification-system
```

#### Restart Services

```bash
# Restart application
kubectl rollout restart deployment/notification-app -n notification-system

# Restart database
kubectl rollout restart statefulset notification-postgres -n notification-system

# Restart Redis
docker-compose restart redis
```

#### Enable Maintenance Mode

```bash
# Return 503 to all requests (preserves data integrity)
kubectl set env deployment/notification-app MAINTENANCE_MODE=true -n notification-system
```

#### Disable Feature Flag

```bash
# Disable Kafka consumer to stop processing
kubectl set env deployment/notification-app ENABLE_KAFKA_CONSUMER=false -n notification-system

# Disable specific feature
kubectl set env deployment/notification-app ENABLE_FEATURE_X=false -n notification-system
```

---

### 5. Communication

**Update status page** (P0/P1 only):
- https://status.example.com
- Title: "Notification System Degraded"
- Message: "We're investigating issues with notification delivery. Updates every 15 minutes."

**Post updates in #incidents**:
```
⏱️ 10:15 AM - INVESTIGATING
Error rate spike detected. Checking recent deployments.

⏱️ 10:25 AM - IDENTIFIED
Root cause: Database connection pool exhausted due to slow query.

⏱️ 10:35 AM - MITIGATING
Killed slow query, increased connection pool size, restarted app.

⏱️ 10:45 AM - MONITORING
Error rate back to normal. Monitoring for stability.

✅ 11:00 AM - RESOLVED
Incident resolved. Post-mortem scheduled for 2 PM.
```

**Update frequency**:
- P0: Every 15 minutes
- P1: Every 30 minutes
- P2: Every hour or on major status change
- P3: No public updates

---

### 6. Resolution

**Verify incident is resolved**:

```bash
# Check error rate
curl http://localhost:3000/metrics | grep http_request_errors_total
# Expected: < 1% error rate

# Check latency
curl http://localhost:3000/metrics | grep http_request_duration_seconds
# Expected: P95 < 100ms

# Check health
curl http://localhost:3000/health
# Expected: All services "up"

# Monitor for 15-30 minutes
watch -n 60 'curl -s http://localhost:3000/metrics | grep -E "http_requests_total|http_request_errors_total"'
```

**Mark incident as resolved**:
1. Update status page: "All systems operational"
2. Post in #incidents: "✅ RESOLVED at HH:MM"
3. Close PagerDuty incident
4. Schedule post-mortem (within 48 hours)

---

### 7. Documentation

**Immediately after resolution, document**:

1. **Timeline** (in #incidents thread):
```
10:00 AM - Alert triggered
10:05 AM - Acknowledged by @engineer
10:15 AM - Root cause identified
10:35 AM - Mitigation deployed
10:45 AM - Incident resolved
Duration: 45 minutes
```

2. **Root Cause**: What caused the incident?

3. **Impact**: How many users affected? For how long?

4. **Mitigation**: What actions were taken?

5. **Follow-up Actions**: What needs to be done to prevent recurrence?

---

## Communication Protocols

### Internal Communication

**Primary Channel**: Slack #incidents

**Incident Bridge**: Zoom (P0/P1 only)

**Escalation**: PagerDuty → Manager → VP Engineering → CTO

---

### External Communication

**Status Page**: https://status.example.com

**Support Email**: support@example.com

**Social Media**: Twitter @notificationsystem (for major outages)

---

### Status Page Updates

**Templates**:

**Investigating**:
```
We are currently investigating issues with the Notification System.
Some users may experience delayed or failed notifications.
We will provide updates every 15 minutes.
```

**Identified**:
```
We have identified the issue affecting notification delivery.
Our team is actively working on a fix.
Estimated time to resolution: [X] minutes.
```

**Monitoring**:
```
A fix has been deployed and we are monitoring the system for stability.
Notification delivery is resuming.
```

**Resolved**:
```
The incident has been resolved. All systems are operating normally.
We apologize for any inconvenience.
A post-mortem will be published within 48 hours.
```

---

## Incident Scenarios

### Scenario 1: Complete Service Outage

**Symptoms**:
- Health check returns 503
- All pods in CrashLoopBackOff
- Error: "Cannot connect to database"

**Severity**: P0

**Runbook**:

```bash
# 1. Check pod status
kubectl get pods -n notification-system
# Output: All pods CrashLoopBackOff

# 2. Check logs
kubectl logs -l app=notification-app -n notification-system --tail=50
# Error: "Error: P1001: Can't reach database server at `postgres:5432`"

# 3. Check database status
kubectl get pods -l app=postgres -n notification-system
# Output: postgres-0 is Running

# 4. Test database connectivity from app pod
kubectl exec -it notification-app-xxx -n notification-system -- nc -zv postgres 5432
# Output: Connection refused

# 5. Diagnosis: Database DNS resolution failing
# Solution: Restart CoreDNS
kubectl rollout restart deployment/coredns -n kube-system

# 6. Wait for CoreDNS to stabilize (30 seconds)
sleep 30

# 7. Restart application
kubectl rollout restart deployment/notification-app -n notification-system

# 8. Verify resolution
kubectl get pods -n notification-system
# Expected: All pods Running

curl http://localhost:3000/health
# Expected: {"status": "ok"}
```

**Duration**: 5-10 minutes

**Follow-up**: Implement DNS monitoring, consider StatefulSet for stable DNS

---

### Scenario 2: High Error Rate (External Service Failure)

**Symptoms**:
- Error rate: 60%
- Logs: "SendGrid API timeout"
- Alerts: HighErrorRate

**Severity**: P1

**Runbook**:

```bash
# 1. Check error rate
curl http://localhost:3000/metrics | grep http_request_errors_total
# Output: High 5xx errors

# 2. Check logs for error patterns
kubectl logs -l app=notification-app -n notification-system | grep ERROR | tail -50
# Pattern: "SendGrid API error: Timeout"

# 3. Check SendGrid status
curl https://status.sendgrid.com/api/v2/status.json
# Output: { "status": { "indicator": "major" } }

# 4. Diagnosis: SendGrid outage
# Mitigation: Enable mock service temporarily

# 5. Switch to mock service
kubectl set env deployment/notification-app ENABLE_MOCK_SERVICES=true -n notification-system

# 6. Verify error rate decreases
curl http://localhost:3000/metrics | grep http_request_errors_total
# Expected: Error rate < 5%

# 7. Monitor SendGrid status
# Once resolved, switch back to real service
kubectl set env deployment/notification-app ENABLE_MOCK_SERVICES=false -n notification-system
```

**Duration**: 15-30 minutes (depends on SendGrid recovery)

**Follow-up**: Implement circuit breaker pattern, add alternative providers

---

### Scenario 3: Database Connection Pool Exhausted

**Symptoms**:
- Error: "Connection pool timeout"
- P95 latency > 5 seconds
- Alerts: DatabaseConnectionPoolExhausted

**Severity**: P2

**Runbook**:

```bash
# 1. Check active connections
curl http://localhost:3000/metrics | grep db_connections_active
# Output: db_connections_active 19 (of 20 max)

# 2. Check for slow queries
kubectl logs -l app=notification-app -n notification-system | grep "slow query" | tail -20
# Pattern: "Slow query: SELECT * FROM notifications WHERE userId = '...'"

# 3. Diagnosis: N+1 query or missing index
# Immediate mitigation: Increase connection pool

# 4. Update connection pool size
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=50"
kubectl set env deployment/notification-app DATABASE_URL="$DATABASE_URL" -n notification-system

# 5. Restart application
kubectl rollout restart deployment/notification-app -n notification-system

# 6. Verify connections
curl http://localhost:3000/metrics | grep db_connections_active
# Expected: db_connections_active < 40 (of 50 max)
```

**Duration**: 10-15 minutes

**Follow-up**: Optimize queries, add indexes, fix N+1 queries

---

### Scenario 4: Kafka Consumer Lag Spike

**Symptoms**:
- Consumer lag > 10,000 messages
- Notifications delayed by 10+ minutes
- Alerts: KafkaConsumerLagHigh

**Severity**: P2

**Runbook**:

```bash
# 1. Check consumer lag
curl http://localhost:3000/admin/queue/stats -H "Authorization: Bearer $ADMIN_TOKEN" | jq
# Output: { "lag": 12543, "partitions": 10 }

# 2. Check consumer logs
kubectl logs -l app=notification-app -n notification-system | grep "Kafka consumer"
# Pattern: "Processing message... took 5.2s"

# 3. Diagnosis: Slow external service calls
# Check external service latency
curl http://localhost:3000/metrics | grep notification_delivery_duration_seconds
# Output: P95 = 8.5 seconds (normally < 1s)

# 4. Mitigation: Scale consumers
kubectl scale deployment notification-app --replicas=20 -n notification-system

# 5. Monitor lag reduction
watch -n 10 'curl -s http://localhost:3000/admin/queue/stats -H "Authorization: Bearer $ADMIN_TOKEN" | jq .lag'
# Expected: Lag decreasing

# 6. Once lag < 100, scale back down
kubectl scale deployment notification-app --replicas=3 -n notification-system
```

**Duration**: 20-30 minutes

**Follow-up**: Implement timeout for external calls, add retry with backoff

---

### Scenario 5: Memory Leak (OOM Kills)

**Symptoms**:
- Pods restarting every 2 hours
- Logs: "JavaScript heap out of memory"
- Alerts: HighMemoryUsage

**Severity**: P2

**Runbook**:

```bash
# 1. Check pod restarts
kubectl get pods -n notification-system
# Output: notification-app-xxx   Restarts: 5

# 2. Check memory usage trend
curl http://localhost:3000/metrics | grep nodejs_heap_size_used_bytes
# Output: nodejs_heap_size_used_bytes 480000000 (480 MB, limit 512 MB)

# 3. Check for memory leak patterns
kubectl logs -l app=notification-app -n notification-system --previous | tail -100
# Pattern: "FATAL ERROR: Ineffective mark-compacts near heap limit"

# 4. Immediate mitigation: Increase memory limit
kubectl set resources deployment notification-app \
  --limits=memory=2048Mi \
  --requests=memory=1024Mi \
  -n notification-system

# 5. Restart to apply new limits
kubectl rollout restart deployment/notification-app -n notification-system

# 6. Monitor memory usage
watch -n 60 'curl -s http://localhost:3000/metrics | grep nodejs_heap_size_used_bytes'

# 7. Long-term: Profile application to find leak
# - Enable heap snapshots
# - Use Chrome DevTools to analyze
# - Review recent code changes
```

**Duration**: 15 minutes (mitigation), hours/days (fix leak)

**Follow-up**: Profile app with heap snapshots, review recent code, add memory monitoring

---

## Post-Incident Review

### Post-Mortem Template

**File**: `incidents/YYYY-MM-DD-incident-name.md`

```markdown
# Post-Mortem: [Incident Title]

## Metadata

- **Incident ID**: INC-2025-001
- **Date**: December 7, 2025
- **Severity**: P0/P1/P2/P3
- **Duration**: XX minutes
- **Incident Commander**: [Name]
- **Participants**: [Names]

## Summary

[Brief 2-3 sentence summary of what happened]

## Impact

- **Users Affected**: [Number or percentage]
- **Duration**: [Time from detection to resolution]
- **Revenue Impact**: [If applicable]
- **SLA Breach**: Yes/No

## Timeline

All times in UTC.

- **09:00** - [First symptom detected]
- **09:05** - [Alert fired]
- **09:10** - [On-call acknowledged]
- **09:20** - [Root cause identified]
- **09:35** - [Mitigation deployed]
- **09:45** - [Service restored]
- **10:00** - [Incident resolved]

## Root Cause

[Detailed explanation of what caused the incident]

## Detection

[How was the incident detected? Alert, user report, etc.]

## Mitigation

[What actions were taken to restore service?]

## Resolution

[What actions were taken to fix the root cause?]

## Lessons Learned

### What Went Well

- [Things that worked well during response]

### What Went Wrong

- [Things that didn't work well]

### Where We Got Lucky

- [Things that could have gone worse]

## Action Items

| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| [Task 1] | [Name] | [Date] | High |
| [Task 2] | [Name] | [Date] | Medium |

## Appendix

### Logs

[Relevant log snippets]

### Metrics

[Screenshots of dashboards]

### Communication

[Timeline of status page updates]
```

---

### Post-Mortem Meeting

**When**: Within 48 hours of incident resolution

**Duration**: 1 hour

**Attendees**:
- Incident Commander
- Technical responders
- Engineering Manager
- Product Manager (if user-facing impact)

**Agenda**:
1. Review timeline (10 min)
2. Discuss root cause (15 min)
3. Identify lessons learned (15 min)
4. Define action items (15 min)
5. Q&A (5 min)

**Rules**:
- Blameless: Focus on systems, not people
- Fact-based: Use logs, metrics, timestamps
- Action-oriented: What will we change?

---

## Tools & Resources

### Monitoring

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686

### Communication

- **Slack**: #incidents channel
- **PagerDuty**: https://pagerduty.com
- **Status Page**: https://status.example.com
- **Incident Bridge**: https://zoom.us/j/incident-bridge

### Documentation

- **Runbooks**: `/docs/runbooks/`
- **Architecture Diagram**: [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)
- **Troubleshooting Guide**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Monitoring Guide**: [MONITORING_GUIDE.md](./MONITORING_GUIDE.md)

### Access

- **Kubernetes**: `kubectl config use-context production`
- **Database**: See secrets manager
- **AWS Console**: https://console.aws.amazon.com
- **GitHub**: https://github.com/org/notification-system

---

## Emergency Contacts

### On-Call

- **Primary**: View in PagerDuty
- **Secondary**: View in PagerDuty
- **On-Call Phone**: +1-555-ONCALL

### Escalation

- **Engineering Manager**: manager@example.com, +1-555-MANAGER
- **VP Engineering**: vp-eng@example.com, +1-555-VP-ENG
- **CTO**: cto@example.com, +1-555-CTO

### External Support

- **AWS Support**: 1-877-AWS-SUPPORT
- **SendGrid Support**: support@sendgrid.com, 1-888-SENDGRID
- **Twilio Support**: help@twilio.com, 1-888-TWILIO
- **Database DBA**: dba@example.com, +1-555-DBA
