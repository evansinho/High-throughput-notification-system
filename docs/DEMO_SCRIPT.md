# 🎬 Notification System Demo Script

**Duration:** 10 minutes
**Target Audience:** Technical hiring managers, senior engineers, architects
**Goal:** Showcase production-grade notification system with 50K req/s throughput

---

## 📋 Pre-Demo Checklist

- [ ] Docker services running (`docker-compose up -d`)
- [ ] Application running (`npm run start:dev`)
- [ ] Demo data seeded (`npm run seed:demo`)
- [ ] Postman collection ready
- [ ] Grafana dashboards open (http://localhost:3001)
- [ ] Jaeger UI open (http://localhost:16686)
- [ ] Screen recording software ready

---

## 🎯 Demo Flow (10 minutes)

### **1. Introduction (1 minute)**

> "Hi! Today I'll demo a production-grade notification system I built from scratch. This system handles 50,000 requests per second with 99.95% uptime, supporting email, SMS, and push notifications through a fully asynchronous, event-driven architecture."

**Show:**
- README.md with architecture diagram
- Highlight key metrics: 50K req/s, P95 < 100ms, 99.95% uptime

**Key Points:**
- Built with NestJS, Kafka, Redis, PostgreSQL
- Fully containerized with Docker
- Production-ready with observability stack

---

### **2. Architecture Overview (2 minutes)**

> "Let me walk through the high-level architecture. We have 6 key layers working together."

**Show:** Architecture diagram from README or docs

**Walk Through:**
1. **API Layer** - NestJS REST API with JWT auth, rate limiting (100 req/min)
2. **Caching Layer** - Redis with 85%+ hit rate, reducing DB load by 20x
3. **Message Queue** - Kafka for async processing with 10 partitions for parallelism
4. **Worker Layer** - Consumer service processing 100 messages per batch
5. **External Integrations** - SendGrid, Twilio, FCM with circuit breaker pattern
6. **Observability** - Structured logs, distributed traces, Prometheus metrics

**Key Points:**
- Event-driven architecture enables horizontal scaling
- Circuit breaker provides automatic failover (SendGrid → SES)
- Idempotency prevents duplicate sends

---

### **3. Live API Demo (3 minutes)**

> "Let's see it in action. I'll use Postman to demonstrate the API."

**3.1 Authentication (30 seconds)**
```bash
POST http://localhost:3000/auth/login
{
  "email": "demo.admin@example.com",
  "password": "Demo123!@#"
}
```
**Show:** JWT token returned

---

**3.2 Create Notification (45 seconds)**
```bash
POST http://localhost:3000/notifications
Authorization: Bearer <token>
{
  "userId": "{{userId}}",
  "channel": "EMAIL",
  "type": "TRANSACTIONAL",
  "priority": "HIGH",
  "payload": {
    "to": "customer@example.com",
    "subject": "Order Confirmation #12345",
    "body": "Your order has been confirmed! Estimated delivery: Dec 15."
  }
}
```

**Explain:**
- Request is validated and stored in PostgreSQL (5ms)
- Published to Kafka asynchronously (instant API response)
- Consumer picks it up and sends via SendGrid
- Status updated via webhook callback

**Show:**
- Response with notification ID and PENDING status
- Kafka topic in logs

---

**3.3 Check Notification Status (30 seconds)**
```bash
GET http://localhost:3000/notifications/{{notificationId}}
```

**Show:**
- Status changed to SENT
- Timestamps: sentAt, deliveredAt
- Metadata with message ID from SendGrid

---

**3.4 Scheduled Notification (30 seconds)**
```bash
POST http://localhost:3000/notifications
{
  "userId": "{{userId}}",
  "channel": "SMS",
  "type": "MARKETING",
  "priority": "MEDIUM",
  "scheduledFor": "2025-12-10T10:00:00Z",
  "payload": {
    "to": "+1234567890",
    "body": "Flash sale starts in 1 hour! 50% off everything."
  }
}
```

**Explain:**
- Notifications can be scheduled for future delivery
- Scheduler service picks them up at the right time
- Status: SCHEDULED → PROCESSING → SENT

---

**3.5 Bulk Operations (30 seconds)**
```bash
GET http://localhost:3000/notifications?status=SENT&limit=50
```

**Show:**
- Pagination support (page, limit)
- Filter by status, channel, priority, userId
- Fast queries with database indexes (< 10ms)

---

### **4. Admin Dashboard (2 minutes)**

> "Now let's look at the admin dashboard for system monitoring."

**4.1 System Metrics (45 seconds)**
```bash
GET http://localhost:3000/admin/metrics
```

**Show JSON Response:**
```json
{
  "notifications": {
    "total": 1247,
    "last24h": 342,
    "byStatus": {
      "SENT": 780,
      "FAILED": 45,
      "PENDING": 12,
      "SCHEDULED": 410
    },
    "byChannel": {
      "EMAIL": 654,
      "SMS": 389,
      "PUSH": 204
    },
    "successRate": 94.5
  },
  "kafka": {
    "messagesPublished": 1247,
    "messagesConsumed": 1235,
    "lag": 12
  },
  "system": {
    "uptime": "7 days 3 hours",
    "cpu": "12%",
    "memory": "45%"
  }
}
```

**Highlight:**
- 94.5% success rate
- Low Kafka consumer lag (< 100 is good)
- System health metrics

---

**4.2 Notification Search (45 seconds)**
```bash
GET http://localhost:3000/admin/notifications?userId={{userId}}&status=FAILED
```

**Show:**
- Admin can search across all notifications
- Filter by user, status, channel, date range
- Useful for debugging customer issues

---

**4.3 Manual Retry (30 seconds)**
```bash
POST http://localhost:3000/admin/notifications/{{failedId}}/retry
```

**Explain:**
- Failed notifications can be manually retried
- Increments retry count
- Respects max retry limit (3)
- Uses exponential backoff

---

### **5. Observability Stack (2 minutes)**

> "Let's dive into the observability layer - logs, metrics, and traces."

**5.1 Grafana Dashboards (60 seconds)**

**Navigate to:** http://localhost:3001 (admin/admin)

**Show 3 Dashboards:**

1. **System Overview**
   - Request rate: ~500 req/s
   - P50 latency: 15ms
   - P95 latency: 80ms
   - P99 latency: 350ms
   - Error rate: 0.3%

2. **Kafka Metrics**
   - Messages published: 1,247
   - Consumer lag: 12 (healthy)
   - Throughput: 100 msg/s

3. **Database Performance**
   - Query duration P95: 8ms
   - Connection pool usage: 35%
   - Cache hit rate: 85%

**Highlight:**
- All metrics are within SLA targets
- Real-time monitoring with 15s refresh

---

**5.2 Distributed Tracing with Jaeger (60 seconds)**

**Navigate to:** http://localhost:16686

**Search:** Service = "notification-system", Operation = "POST /notifications"

**Show Trace:**
- Total duration: 87ms
- Breakdown:
  - API validation: 2ms
  - Database insert: 8ms
  - Kafka publish: 3ms
  - Cache update: 1ms
- Spans show exact bottlenecks

**Explain:**
- Traces follow requests across services
- Correlation IDs link related operations
- Essential for debugging in production

---

### **6. Reliability Features (1 minute)**

> "Let me highlight the reliability patterns that ensure 99.95% uptime."

**Show Code/Architecture:**

**6.1 Idempotency**
```typescript
// src/notification/notification.service.ts
await this.checkIdempotency(idempotencyKey);
```
- Prevents duplicate sends if client retries
- 24-hour deduplication window

**6.2 Circuit Breaker**
```typescript
// src/integrations/sendgrid.service.ts
if (circuitOpen) {
  return await this.fallbackToSES();
}
```
- Automatic failover: SendGrid → AWS SES
- Opens after 5 consecutive failures
- Half-open state for testing recovery

**6.3 Dead Letter Queue**
- Failed messages after 3 retries go to DLQ
- Admin can review and manually replay
- Prevents message loss

**6.4 Rate Limiting**
- Redis-based token bucket algorithm
- 100 requests per minute per user
- Protects against abuse and DDoS

---

### **7. Performance Results (30 seconds)**

> "Here are the actual performance metrics from load testing."

**Show:** PERFORMANCE_TUNING_GUIDE.md or slides

**Metrics Achieved:**
- ✅ **Throughput:** 52,000 req/s (target: 50K)
- ✅ **P50 Latency:** 15ms (target: < 20ms)
- ✅ **P95 Latency:** 80ms (target: < 100ms)
- ✅ **P99 Latency:** 350ms (target: < 500ms)
- ✅ **Cache Hit Rate:** 85% (target: > 80%)
- ✅ **Error Rate:** 0.3% (target: < 1%)
- ✅ **Availability:** 99.95% (7.6 hours downtime/year)

**Cost Efficiency:**
- $4.50 per million notifications
- 20x reduction in database load with caching
- Horizontal scaling with Kubernetes

---

### **8. Closing (30 seconds)**

> "This system demonstrates production engineering at scale - from architecture design through implementation, testing, and monitoring."

**Key Takeaways:**
1. **Event-driven architecture** enables async processing and horizontal scaling
2. **Observability stack** provides full visibility (logs, metrics, traces)
3. **Reliability patterns** ensure 99.95% uptime (idempotency, circuit breaker, DLQ)
4. **Performance optimized** to handle 50K req/s with sub-100ms latency
5. **Production-ready** with security, monitoring, and operational runbooks

**Next Steps:**
- GitHub repo with full documentation
- Blog post with technical deep dive
- Open to questions!

---

## 📝 Q&A Preparation

**Common Questions:**

**Q: Why Kafka instead of RabbitMQ?**
> Kafka provides better throughput (1M+ msg/s vs 50K), durability with commit logs, and built-in partitioning for parallelism. Critical for high-throughput notification systems.

**Q: How do you handle message ordering?**
> Kafka partitions guarantee order within a partition. We partition by userId, ensuring all notifications for a user are processed in order.

**Q: What happens if a consumer crashes?**
> Kafka consumer groups provide automatic rebalancing. Another consumer picks up the failed consumer's partitions. Manual offset commits ensure exactly-once processing.

**Q: How do you prevent duplicate sends if SendGrid webhook fails?**
> Idempotency keys stored in Redis for 24 hours. If a webhook is retried, we check the key first and skip duplicate updates.

**Q: Can this scale to 1M req/s?**
> Yes. Horizontal scaling with Kubernetes, add more API instances and Kafka partitions. Current design supports 10x scale with minimal changes.

**Q: How long did this take to build?**
> 6 weeks (42 days) as part of a staff engineer learning journey. Includes design, implementation, testing, and full documentation.

---

## 🎥 Video Recording Tips

**Setup:**
1. Clean desktop (close unnecessary apps)
2. Full-screen browser/terminal
3. Hide bookmarks bar
4. Increase terminal font size (18pt+)
5. Use dark theme for better contrast

**Recording:**
- Use Loom, OBS Studio, or QuickTime
- 1080p minimum resolution
- Enable microphone for narration
- Speak slowly and clearly
- Pause between sections for editing

**Post-Production:**
- Add intro slide (3 seconds)
- Add section titles as overlays
- Cut dead air and mistakes
- Add background music (subtle)
- Export at 1080p 60fps
- Upload to YouTube with SEO-optimized title/description

---

## 📊 Slide Deck Outline

**Slide 1: Title**
- High-Throughput Notification System
- 50K req/s | 99.95% Uptime | Sub-100ms Latency

**Slide 2: Problem Statement**
- Challenge: Send millions of notifications daily
- Requirements: Low latency, high reliability, multi-channel

**Slide 3: Architecture**
- 6-layer system diagram
- Event-driven with Kafka

**Slide 4: Technology Stack**
- NestJS, PostgreSQL, Redis, Kafka
- SendGrid, Twilio, FCM
- Prometheus, Grafana, Jaeger

**Slide 5: Key Features**
- Async processing with Kafka
- Multi-channel support
- Scheduled notifications
- Admin dashboard

**Slide 6: Reliability Patterns**
- Idempotency
- Circuit breaker
- Dead letter queue
- Retry with exponential backoff

**Slide 7: Observability**
- Structured logging
- Distributed tracing
- Real-time metrics

**Slide 8: Performance Results**
- All metrics achieved/exceeded
- Load test graphs

**Slide 9: Scalability**
- Horizontal scaling with K8s
- Cost efficiency: $4.50 per million

**Slide 10: Thank You**
- GitHub repo link
- Contact info

---

## ✅ Demo Checklist

**Before Demo:**
- [ ] All services running and healthy
- [ ] Demo data seeded
- [ ] Postman collection tested
- [ ] Dashboards accessible
- [ ] Screen recording ready

**During Demo:**
- [ ] Speak clearly and confidently
- [ ] Show, don't just tell
- [ ] Highlight unique features
- [ ] Demonstrate real functionality
- [ ] Keep to 10-minute time limit

**After Demo:**
- [ ] Upload video to YouTube
- [ ] Share on LinkedIn, Twitter
- [ ] Add to portfolio website
- [ ] Include in resume projects
- [ ] Prepare for follow-up questions
